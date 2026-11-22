import json
import uuid

from fastapi import HTTPException

from .database import SessionLocal
from .keitaro import KeitaroClient, KeitaroError
from .models import Campaign
from .schemas import (
    AddOfferIn,
    CampaignCreate,
    CampaignOfferOut,
    CampaignOut,
    CampaignStreamsOut,
    ExportOffersIn,
    ImportedStreamOut,
    OfferOut,
    StreamOfferOut,
)


def _keitaro() -> KeitaroClient:
    return KeitaroClient()


def _keitaro_error(exc: KeitaroError) -> HTTPException:
    return HTTPException(status_code=502, detail=f"Keitaro API error: {exc}")


def _find_offers_stream(streams: list[dict]) -> dict | None:
    for stream in streams:
        if stream.get("type") == "default" or stream.get("schema") == "landings":
            return stream
    return None


def _rebalance(entries: list[tuple[int, int]]) -> list[dict]:
    """Rebalance (offer_id, weight) entries into shares that sum to 100."""
    if not entries:
        return []
    total = sum(weight for _, weight in entries) or 1
    shares = [round(weight * 100 / total) for _, weight in entries]
    shares[0] += 100 - sum(shares)
    return [{"offer_id": offer_id, "share": share} for (offer_id, _), share in zip(entries, shares)]


def _rebalance_export(entries: list[tuple[int, int, bool]]) -> list[dict]:
    """Rebalance (offer_id, weight, pinned) entries into shares that sum to 100.

    Pinned offers keep their exact share. The remaining share is distributed
    between unpinned offers proportionally to their weights.
    """
    if not entries:
        return []

    pinned = [(offer_id, share) for offer_id, share, is_pinned in entries if is_pinned]
    flexible = [(offer_id, share) for offer_id, share, is_pinned in entries if not is_pinned]

    pinned_total = sum(share for _, share in pinned)
    if pinned_total > 100:
        raise HTTPException(status_code=400, detail="Сумма зафиксированных долей не может превышать 100%")

    remaining = 100 - pinned_total
    result: dict[int, int] = {offer_id: share for offer_id, share in pinned}

    if not flexible:
        if remaining != 0:
            raise HTTPException(
                status_code=400,
                detail="Если все офферы зафиксированы, их доли должны давать ровно 100%",
            )
    elif remaining > 0:
        total_weight = sum(share for _, share in flexible)
        if total_weight > 0:
            raw = [share * remaining / total_weight for _, share in flexible]
        else:
            raw = [remaining / len(flexible)] * len(flexible)
        shares = [round(value) for value in raw]
        shares[0] += remaining - sum(shares)
        for (offer_id, _), share in zip(flexible, shares):
            result[offer_id] = share
    else:
        for offer_id, _ in flexible:
            result[offer_id] = 0

    return [{"offer_id": offer_id, "share": result[offer_id]} for offer_id, _, _ in entries]


def _offer_name_map(client: KeitaroClient) -> dict[int, str]:
    try:
        offers = client.list_offers()
    except KeitaroError:
        return {}
    return {o["id"]: o.get("name") or f"Offer #{o['id']}" for o in offers}


def create_campaign(data: CampaignCreate) -> CampaignOut:
    client = _keitaro()

    alias = f"adr_{uuid.uuid4().hex[:10]}"

    try:
        campaign = client.create_campaign(
            {
                "name": data.name,
                "alias": alias,
                "group_id": data.group_id,
                "traffic_source_id": data.traffic_source_id,
                "domain_id": data.domain_id,
            }
        )
        campaign_id = campaign["id"]

        google_stream = client.create_stream(
            {
                "campaign_id": campaign_id,
                "name": f"Google ({data.geo_code.upper()})",
                "type": "regular",
                "schema": "redirect",
                "action_type": "http",
                "action_payload": "https://google.com",
                "position": 1,
                "filters": [
                    {"name": "country", "mode": "accept", "payload": [data.geo_code.upper()]}
                ],
            }
        )

        offers_stream = client.create_stream(
            {
                "campaign_id": campaign_id,
                "name": "Offers",
                "type": "default",
                "schema": "landings",
                "action_type": "http",
                "action_payload": "",
                "position": 2,
                "offers": [{"offer_id": data.offer_id, "share": 100}],
            }
        )
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    db = SessionLocal()
    try:
        record = Campaign(
            keitaro_id=campaign_id,
            name=data.name,
            alias=alias,
            geo_code=data.geo_code.upper(),
            domain_id=data.domain_id,
            group_id=data.group_id,
            traffic_source_id=data.traffic_source_id,
            initial_offer_id=data.offer_id,
            google_stream_id=google_stream["id"],
            offers_stream_id=offers_stream["id"],
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return CampaignOut.model_validate(record)
    finally:
        db.close()


def list_campaigns() -> list[CampaignOut]:
    db = SessionLocal()
    try:
        return [CampaignOut.model_validate(c) for c in db.query(Campaign).order_by(Campaign.id.desc()).all()]
    finally:
        db.close()


def _imported_campaign_meta(client: KeitaroClient, campaign_id: int) -> dict:
    """Best-effort stream metadata for a campaign imported from Keitaro."""
    meta = {
        "geo_code": None,
        "google_stream_id": None,
        "offers_stream_id": None,
        "initial_offer_id": None,
    }
    try:
        streams = client.get_campaign_streams(campaign_id)
    except KeitaroError:
        return meta

    offers_stream = _find_offers_stream(streams)
    if offers_stream:
        meta["offers_stream_id"] = offers_stream.get("id")
        offers = offers_stream.get("offers") or []
        if offers:
            meta["initial_offer_id"] = offers[0].get("offer_id")

    for stream in streams:
        name = (stream.get("name") or "").lower()
        if meta["google_stream_id"] is None and (
            stream.get("schema") == "redirect" or "google" in name
        ):
            meta["google_stream_id"] = stream.get("id")
            for filter_item in stream.get("filters") or []:
                if filter_item.get("name") != "country":
                    continue
                payload = filter_item.get("payload")
                if isinstance(payload, list) and payload:
                    meta["geo_code"] = str(payload[0])[:10]
                elif isinstance(payload, str) and payload:
                    meta["geo_code"] = payload[:10]
                break
    return meta


def import_campaign(campaign_id: int) -> CampaignOut:
    """Import a campaign from Keitaro: update it or create a local record."""
    client = _keitaro()
    try:
        remote = client.get_campaign(campaign_id)
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    meta = _imported_campaign_meta(client, campaign_id)
    name = str(remote.get("name") or f"Campaign #{campaign_id}")[:255]
    alias = str(remote.get("alias") or f"kt_{campaign_id}")[:255]
    group_name = remote.get("group") or None
    group_name = str(group_name)[:255] if group_name else None

    db = SessionLocal()
    try:
        record = db.query(Campaign).filter(Campaign.keitaro_id == campaign_id).first()
        if not record:
            record = Campaign(
                keitaro_id=campaign_id,
                name=name,
                alias=alias,
                geo_code=meta["geo_code"],
                domain_id=remote.get("domain_id"),
                domain_name=None,
                group_id=remote.get("group_id"),
                group_name=group_name,
                traffic_source_id=remote.get("traffic_source_id"),
                traffic_source_name=None,
                initial_offer_id=meta["initial_offer_id"],
                google_stream_id=meta["google_stream_id"],
                offers_stream_id=meta["offers_stream_id"],
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return CampaignOut.model_validate(record)

        record.name = name
        record.alias = alias
        for field, value in (
            ("geo_code", meta["geo_code"]),
            ("domain_id", remote.get("domain_id")),
            ("group_id", remote.get("group_id")),
            ("group_name", group_name),
            ("traffic_source_id", remote.get("traffic_source_id")),
            ("initial_offer_id", meta["initial_offer_id"]),
            ("google_stream_id", meta["google_stream_id"]),
            ("offers_stream_id", meta["offers_stream_id"]),
        ):
            if value is not None and getattr(record, field) is None:
                setattr(record, field, value)

        db.commit()
        db.refresh(record)
        return CampaignOut.model_validate(record)
    finally:
        db.close()


def get_campaign_offers(campaign_id: int) -> list[CampaignOfferOut]:
    client = _keitaro()
    try:
        streams = client.get_campaign_streams(campaign_id)
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    offers_stream = _find_offers_stream(streams)
    if not offers_stream:
        return []

    names = _offer_name_map(client)
    result = []
    for offer in offers_stream.get("offers", []):
        offer_id = offer["offer_id"]
        result.append(
            CampaignOfferOut(
                offer_id=offer_id,
                offer_name=names.get(offer_id, f"Offer #{offer_id}"),
                share=offer.get("share", 0),
                stats=offer.get("stats"),
                trends=offer.get("trends"),
            )
        )
    return result


def add_offer(campaign_id: int, data: AddOfferIn) -> list[CampaignOfferOut]:
    client = _keitaro()
    try:
        streams = client.get_campaign_streams(campaign_id)
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    offers_stream = _find_offers_stream(streams)

    entries = []
    if offers_stream:
        entries = [(o["offer_id"], o.get("share", 0)) for o in offers_stream.get("offers", [])]

    if any(offer_id == data.offer_id for offer_id, _ in entries):
        raise HTTPException(status_code=400, detail="Offer already exists in campaign")

    if data.share is not None:
        entries.append((data.offer_id, data.share))
    else:
        entries = [(offer_id, 100) for offer_id, _ in entries] + [(data.offer_id, 100)]

    offers = _rebalance(entries)

    try:
        if offers_stream:
            client.update_stream(offers_stream["id"], {"campaign_id": campaign_id, "offers": offers})
        else:
            client.create_stream(
                {
                    "campaign_id": campaign_id,
                    "name": "Offers",
                    "type": "default",
                    "schema": "landings",
                    "action_type": "http",
                    "action_payload": "",
                    "position": 2,
                    "offers": offers,
                }
            )
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    return get_campaign_offers(campaign_id)


def export_offers(campaign_id: int, data: ExportOffersIn) -> CampaignStreamsOut:
    """Apply the staged offer list of every stream to Keitaro."""
    client = _keitaro()
    try:
        streams = client.get_campaign_streams(campaign_id)
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    streams_by_id = {s["id"]: s for s in streams if s.get("id") is not None}

    try:
        for group in data.streams:
            seen: set[int] = set()
            for item in group.offers:
                if item.offer_id in seen:
                    raise HTTPException(status_code=400, detail="Duplicate offer in export payload")
                seen.add(item.offer_id)

            entries = [
                (o.offer_id, 100 if o.share is None else o.share, o.pinned)
                for o in group.offers
            ]
            offers = _rebalance_export(entries)

            target = (
                streams_by_id.get(group.stream_id)
                if group.stream_id is not None
                else _find_offers_stream(streams)
            )

            if target:
                client.update_stream(target["id"], {"campaign_id": campaign_id, "offers": offers})
            elif offers:
                client.create_stream(
                    {
                        "campaign_id": campaign_id,
                        "name": "Offers",
                        "type": "default",
                        "schema": "landings",
                        "action_type": "http",
                        "action_payload": "",
                        "position": 2,
                        "offers": offers,
                    }
                )
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    return import_streams(campaign_id)


def remove_offer(campaign_id: int, offer_id: int) -> list[CampaignOfferOut]:
    client = _keitaro()
    try:
        streams = client.get_campaign_streams(campaign_id)
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    offers_stream = _find_offers_stream(streams)
    if not offers_stream:
        return []

    entries = [(o["offer_id"], o.get("share", 0)) for o in offers_stream.get("offers", [])]
    entries = [(oid, weight) for oid, weight in entries if oid != offer_id]

    offers = _rebalance(entries)

    try:
        client.update_stream(offers_stream["id"], {"campaign_id": campaign_id, "offers": offers})
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    return get_campaign_offers(campaign_id)


def import_streams(campaign_id: int) -> CampaignStreamsOut:
    client = _keitaro()
    try:
        streams = client.get_campaign_streams(campaign_id)
    except KeitaroError as exc:
        raise _keitaro_error(exc) from exc

    names = _offer_name_map(client)

    with_offers: list[ImportedStreamOut] = []
    without_offers: list[ImportedStreamOut] = []

    for stream in streams:
        stream_offers = [
            StreamOfferOut(
                offer_id=o["offer_id"],
                offer_name=names.get(o["offer_id"], f"Offer #{o['offer_id']}"),
                share=o.get("share", 0),
                stats=o.get("stats"),
                trends=o.get("trends"),
            )
            for o in stream.get("offers") or []
        ]

        action_payload = stream.get("action_payload")
        if isinstance(action_payload, dict):
            action_payload = json.dumps(action_payload, ensure_ascii=False)
        elif action_payload is None:
            action_payload = ""

        item = ImportedStreamOut(
            id=stream.get("id"),
            name=stream.get("name") or f"Stream #{stream.get('id')}",
            type=stream.get("type"),
            schema=stream.get("schema"),
            weight=stream.get("weight"),
            action_type=stream.get("action_type"),
            action_payload=str(action_payload),
            offers=stream_offers,
        )

        if stream_offers:
            with_offers.append(item)
        else:
            without_offers.append(item)

    return CampaignStreamsOut(
        campaign_id=campaign_id,
        with_offers=with_offers,
        without_offers_count=len(without_offers),
        without_offers=without_offers,
    )
