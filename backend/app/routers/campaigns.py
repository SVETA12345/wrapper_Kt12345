from fastapi import APIRouter

from .. import services
from ..schemas import (
    AddOfferIn,
    CampaignCreate,
    CampaignOfferOut,
    CampaignOut,
    CampaignStreamsOut,
    ExportOffersIn,
)

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.get("", response_model=list[CampaignOut])
def list_campaigns():
    return services.list_campaigns()


@router.post("", response_model=CampaignOut, status_code=201)
def create_campaign(data: CampaignCreate):
    return services.create_campaign(data)


@router.post("/{campaign_id}/import", response_model=CampaignOut)
def import_campaign(campaign_id: int):
    return services.import_campaign(campaign_id)


@router.get("/{campaign_id}/offers", response_model=list[CampaignOfferOut])
def list_offers(campaign_id: int):
    return services.get_campaign_offers(campaign_id)


@router.post("/{campaign_id}/offers", response_model=list[CampaignOfferOut])
def add_offer(campaign_id: int, data: AddOfferIn):
    return services.add_offer(campaign_id, data)


@router.post("/{campaign_id}/offers/export", response_model=CampaignStreamsOut)
def export_offers(campaign_id: int, data: ExportOffersIn):
    return services.export_offers(campaign_id, data)


@router.delete("/{campaign_id}/offers/{offer_id}", response_model=list[CampaignOfferOut])
def remove_offer(campaign_id: int, offer_id: int):
    return services.remove_offer(campaign_id, offer_id)


@router.get("/{campaign_id}/streams", response_model=CampaignStreamsOut)
def import_streams(campaign_id: int):
    return services.import_streams(campaign_id)
