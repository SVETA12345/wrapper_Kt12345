from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    geo_code: str = Field(..., min_length=2, max_length=10, description="ISO country code, e.g. MX")
    offer_id: int
    domain_id: int
    group_id: int
    traffic_source_id: int


class CampaignOut(BaseModel):
    id: int
    keitaro_id: int
    name: str
    alias: str
    geo_code: Optional[str] = None
    domain_id: Optional[int] = None
    domain_name: Optional[str] = None
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    traffic_source_id: Optional[int] = None
    traffic_source_name: Optional[str] = None
    initial_offer_id: Optional[int] = None
    google_stream_id: Optional[int] = None
    offers_stream_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class OfferOut(BaseModel):
    id: int
    name: str
    action_type: Optional[str] = None
    action_payload: Optional[str] = None
    affiliate_network_id: Optional[int] = None
    payout_value: Optional[float] = None
    payout_currency: Optional[str] = None


class CampaignOfferOut(BaseModel):
    offer_id: int
    offer_name: str
    share: int
    stats: Optional[dict] = None
    trends: Optional[list] = None


class AddOfferIn(BaseModel):
    offer_id: int
    share: Optional[int] = Field(default=None, ge=0, le=100)


class ExportOfferIn(BaseModel):
    offer_id: int
    share: Optional[int] = Field(default=None, ge=0, le=100)
    pinned: bool = False


class ExportStreamIn(BaseModel):
    stream_id: Optional[int] = None
    offers: list[ExportOfferIn]


class ExportOffersIn(BaseModel):
    streams: list[ExportStreamIn]


class StreamOfferOut(BaseModel):
    offer_id: int
    offer_name: str
    share: int
    stats: Optional[dict] = None
    trends: Optional[list] = None


class ImportedStreamOut(BaseModel):
    id: Optional[int] = None
    name: str
    type: Optional[str] = None
    schema: Optional[str] = None
    weight: Optional[float] = None
    action_type: Optional[str] = None
    action_payload: str = ""
    offers: list[StreamOfferOut] = []


class CampaignStreamsOut(BaseModel):
    campaign_id: int
    with_offers: list[ImportedStreamOut]
    without_offers_count: int
    without_offers: list[ImportedStreamOut] = []


class ReferenceItem(BaseModel):
    id: int
    name: str
