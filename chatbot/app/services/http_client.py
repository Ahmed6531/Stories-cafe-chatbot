import logging

import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

class ExpressAPIError(Exception):
    pass


class ExpressHttpClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.express_api_base_url).rstrip("/")

    async def get(
        self,
        path: str,
        params: dict | None = None,
        headers: dict | None = None,
    ) -> tuple[dict, httpx.Headers]:
        url = f"{self.base_url}{path}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, params=params, headers=headers)

        if response.status_code >= 400:
            logger.error({
                "service": "express",
                "status": response.status_code,
                "body": response.text,
            })
            raise ExpressAPIError(
                f"GET {path} failed with {response.status_code}: {response.text}"
            )

        return response.json(), response.headers

    async def post(
        self,
        path: str,
        json: dict | None = None,
        headers: dict | None = None,
    ) -> tuple[dict, httpx.Headers]:
        url = f"{self.base_url}{path}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=json, headers=headers)

        if response.status_code >= 400:
            logger.error({
                "service": "express",
                "status": response.status_code,
                "body": response.text,
            })
            raise ExpressAPIError(
                f"POST {path} failed with {response.status_code}: {response.text}"
            )

        return response.json(), response.headers
