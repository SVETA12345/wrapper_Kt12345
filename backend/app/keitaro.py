from typing import Any, Optional

import httpx

from .config import settings


class KeitaroError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Keitaro API error {status_code}: {detail}")


class KeitaroClient:
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = (base_url or settings.keitaro_base_url).rstrip("/")
        self.headers = {"Api-Key": api_key or settings.keitaro_api_key}

    def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}{path}"
        try:
            response = httpx.request(
                method, url, headers=self.headers, timeout=30.0, **kwargs
            )
        except httpx.HTTPError as exc:
            raise KeitaroError(0, str(exc)) from exc

        if response.status_code >= 400:
            raise KeitaroError(response.status_code, response.text)

        if not response.content:
            return None
        return response.json()

    # Offers
    def list_offers(self) -> list[dict]:
        return self._request("GET", "/offers")

    # Campaigns
    def list_campaigns(self, query: str = "", limit: int = 0) -> list[dict]:
        params = {}
        if query:
            params["query"] = query
        if limit:
            params["limit"] = limit
        return self._request("GET", "/campaigns", params=params or None)

    def get_campaign(self, campaign_id: int) -> dict:
        return self._request("GET", f"/campaigns/{campaign_id}")

    def create_campaign(self, payload: dict) -> dict:
        return self._request("POST", "/campaigns", json=payload)

    def get_campaign_streams(self, campaign_id: int) -> list[dict]:
        return self._request("GET", f"/campaigns/{campaign_id}/streams")

    def delete_campaign(self, campaign_id: int) -> Any:
        return self._request("DELETE", f"/campaigns/{campaign_id}")

    # Streams
    def create_stream(self, payload: dict) -> dict:
        return self._request("POST", "/streams", json=payload)

    def update_stream(self, stream_id: int, payload: dict) -> dict:
        return self._request("PUT", f"/streams/{stream_id}", json=payload)

    # Reference data
    def list_domains(self) -> list[dict]:
        return self._request("GET", "/domains")

    def list_groups(self, group_type: str = "campaigns") -> list[dict]:
        return self._request("GET", "/groups", params={"type": group_type})

    def list_traffic_sources(self) -> list[dict]:
        return self._request("GET", "/traffic_sources")
