import httpx
from app.core.config import settings


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
            raise ExpressAPIError(
                f"POST {path} failed with {response.status_code}: {response.text}"
            )

        return response.json(), response.headers

    async def patch(
        self,
        path: str,
        json: dict | None = None,
        headers: dict | None = None,
    ) -> tuple[dict, httpx.Headers]:
        url = f"{self.base_url}{path}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.patch(url, json=json, headers=headers)

        if response.status_code >= 400:
            raise ExpressAPIError(
                f"PATCH {path} failed with {response.status_code}: {response.text}"
            )

        return response.json(), response.headers

    async def delete(
        self,
        path: str,
        headers: dict | None = None,
    ) -> tuple[dict, httpx.Headers]:
        url = f"{self.base_url}{path}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.delete(url, headers=headers)

        if response.status_code >= 400:
            raise ExpressAPIError(
                f"DELETE {path} failed with {response.status_code}: {response.text}"
            )

        return response.json(), response.headers
