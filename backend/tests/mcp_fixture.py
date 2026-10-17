"""Real local MCP protocol fixture; never loaded by production code."""

import argparse
import asyncio
import json
import os
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.server.context import Context

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int)
parser.add_argument("--pid-file")
options = parser.parse_args()
if options.pid_file:
    Path(options.pid_file).write_text(str(os.getpid()), encoding="utf-8")

mcp = FastMCP("Bai test MCP")


def echo(text: str) -> dict:
    """Echo a text and verify the isolated environment."""
    return {
        "text": text,
        "cwd": os.getcwd(),
        "model_key_present": bool(os.getenv("BAI_MODEL_API_KEY")),
        "fixture_token": os.getenv("MCP_FIXTURE_TOKEN", ""),
    }


if not os.getenv("MCP_FIXTURE_NO_ECHO"):
    mcp.tool(echo)

if os.getenv("MCP_FIXTURE_EXTRA"):

    @mcp.tool
    def extra() -> str:
        """Newly discovered fixture tool."""
        return "new tool"


@mcp.tool
def fail() -> str:
    """Return an intentional server error."""
    raise ValueError("fixture business failure")


@mcp.tool
async def slow(seconds: float, counter_file: str = "") -> str:
    """Record admission, then wait to test cancellation without retry."""
    if counter_file:
        path = Path(counter_file)
        path.write_text(path.read_text() + "1" if path.exists() else "1")
    await asyncio.sleep(seconds)
    return "done"


@mcp.tool
async def interactive(ctx: Context) -> str:
    """Request input that the first application version deliberately declines."""
    answer = await ctx.elicit("Please choose", response_type=["yes", "no"])
    return json.dumps({"action": answer.action})


if options.port:
    import uvicorn
    from starlette.responses import JSONResponse

    app = mcp.http_app()

    class Auth:
        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            if (
                scope["type"] == "http"
                and dict(scope["headers"]).get(b"x-test-key") != b"synthetic-mcp-secret"
            ):
                return await JSONResponse({"error": "unauthorized"}, status_code=401)(
                    scope, receive, send
                )
            await self.app(scope, receive, send)

    uvicorn.run(Auth(app), host="127.0.0.1", port=options.port, log_level="critical")
else:
    mcp.run(transport="stdio", show_banner=False)
