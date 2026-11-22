from fastapi import APIRouter, HTTPException

from ..keitaro import KeitaroClient, KeitaroError

router = APIRouter(prefix="/api", tags=["reference"])


def _client():
    return KeitaroClient()


@router.get("/reference/domains")
def list_domains():
    try:
        items = _client().list_domains()
    except KeitaroError as exc:
        raise HTTPException(status_code=502, detail=f"Keitaro API error: {exc}") from exc
    return [{"id": d["id"], "name": d["name"]} for d in items]


@router.get("/reference/groups")
def list_groups():
    try:
        items = _client().list_groups("campaigns")
    except KeitaroError as exc:
        raise HTTPException(status_code=502, detail=f"Keitaro API error: {exc}") from exc
    return [{"id": g["id"], "name": g["name"]} for g in items]


@router.get("/reference/traffic-sources")
def list_traffic_sources():
    try:
        items = _client().list_traffic_sources()
    except KeitaroError as exc:
        raise HTTPException(status_code=502, detail=f"Keitaro API error: {exc}") from exc
    return [{"id": s["id"], "name": s["name"]} for s in items]


@router.get("/keitaro/campaigns")
def search_keitaro_campaigns(q: str = ""):
    """Search campaigns by name, alias or id.

    Keitaro Admin API does not support server-side text search (only
    offset/limit), so the filtering is done locally.
    """
    needle = q.strip().lower()
    if not needle:
        return []

    try:
        campaigns = _client().list_campaigns() or []
    except KeitaroError as exc:
        raise HTTPException(status_code=502, detail=f"Keitaro API error: {exc}") from exc

    matches = [
        c
        for c in campaigns
        if needle in str(c.get("name") or "").lower()
        or needle in str(c.get("alias") or "").lower()
        or needle == str(c.get("id"))
    ]

    return [
        {
            "id": c["id"],
            "name": c.get("name"),
            "alias": c.get("alias"),
            "state": c.get("state"),
            "group": c.get("group"),
        }
        for c in matches[:20]
    ]
