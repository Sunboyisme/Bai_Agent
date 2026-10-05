from urllib.parse import urlparse
import ipaddress
import httpx
from .config import secret_get
from .provider import ConfigurationError


def public_url(url: str) -> str:
    parsed = urlparse(url)
    if (
        parsed.scheme not in ("https", "http")
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ValueError("只支持公开的 HTTP/HTTPS 网页")
    host = parsed.hostname.lower()
    if host == "localhost" or host.endswith((".localhost", ".local")):
        raise ValueError("不读取本机或内网地址")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return url
    if not address.is_global:
        raise ValueError("不读取本机或内网地址")
    return url


async def search_web(query: str) -> dict:
    key = secret_get("search")
    if not key:
        raise ConfigurationError(
            "尚未配置搜索 API，无法联网查证。请在设置中填写 Tavily 密钥。"
        )
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": key,
                "query": query,
                "max_results": 5,
                "include_answer": False,
            },
        )
        response.raise_for_status()
        data = response.json()
        return {
            "query": query,
            "results": [
                {
                    "title": x.get("title"),
                    "url": x.get("url"),
                    "summary": x.get("content", "")[:4000],
                }
                for x in data.get("results", [])
            ],
        }


async def read_webpage(url: str) -> dict:
    public_url(url)
    key = secret_get("search")
    if not key:
        raise ConfigurationError("尚未配置搜索 API，无法读取网页正文。")
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            "https://api.tavily.com/extract", json={"api_key": key, "urls": [url]}
        )
        response.raise_for_status()
        data = response.json()
        results = data.get("results", [])
        if not results:
            return {"url": url, "error": "未获得正文，不可声称已阅读该页面"}
        return {"url": url, "content": results[0].get("raw_content", "")[:18000]}
