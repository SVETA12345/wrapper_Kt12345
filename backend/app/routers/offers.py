from fastapi import APIRouter, HTTPException

from ..keitaro import KeitaroClient, KeitaroError
from ..schemas import OfferOut

router = APIRouter(prefix="/api", tags=["offers"])


@router.get("/offers", response_model=list[OfferOut])
def list_offers():
    try:
        offers = KeitaroClient().list_offers()
    except KeitaroError as exc:
        raise HTTPException(status_code=502, detail=f"Keitaro API error: {exc}") from exc
    return offers
