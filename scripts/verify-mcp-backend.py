"""Run the frozen backend in an isolated profile, with only local fixtures.

Prerequisite: local mock model at 127.0.0.1:8894. No installed app is touched.
"""

import argparse
import ctypes
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--review", type=Path, default=ROOT / ".local-data" / "mcp-review")
parser.add_argument("--exe", type=Path)
parser.add_argument("--port", type=int, default=8796)
parser.add_argument("--expected-version")
options = parser.parse_args()
REVIEW = options.review.resolve()
DATA = REVIEW / "standalone-runtime"
EXE = (options.exe or REVIEW / "backend-dist" / "bai-backend" / "bai-backend.exe").resolve()
DATA.mkdir(parents=True, exist_ok=True)
BASE = f"http://127.0.0.1:{options.port}/api/v1"
token = ""


def api(path, method="GET", body=None):
    request = Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
    )
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def start(log):
    global token
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.upper().startswith("BAI_")
    }
    env.update(
        BAI_DATA_DIR=str(DATA), PATH=str(Path(os.environ["SYSTEMROOT"]) / "System32")
    )
    process = subprocess.Popen(
        [str(EXE), "--port", str(options.port)],
        env=env,
        stdout=log,
        stderr=log,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            token = (DATA / "auth-token").read_text().strip()
            api("/settings")
            if options.expected_version:
                assert api("/health")["version"] == options.expected_version
            return process
        except (OSError, ValueError):
            if process.poll() is not None:
                raise AssertionError(
                    "Frozen backend exited; inspect standalone.log"
                ) from None
            time.sleep(0.15)
    process.terminate()
    process.wait(timeout=15)
    raise AssertionError("Frozen backend did not start")


def process_alive(pid):
    kernel = ctypes.windll.kernel32
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.GetExitCodeProcess.argtypes = [
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_ulong),
    ]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle:
        return False
    code = ctypes.c_ulong()
    try:
        return (
            bool(kernel.GetExitCodeProcess(handle, ctypes.byref(code)))
            and code.value == 259
        )
    finally:
        kernel.CloseHandle(handle)


def wait_for(predicate, seconds=20):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.1)
    raise AssertionError("Verification condition timed out")


with (REVIEW / "standalone.log").open("w", encoding="utf-8") as log:
    process = start(log)
    server_id = None
    try:
        for server in api("/mcp/servers"):
            api(f"/mcp/servers/{server['id']}", "DELETE")
        api("/tools/calculate", "PATCH", {"enabled": True})
        pid_file = DATA / "fixture.pid"
        value = {
            "name": "Frozen stdio fixture",
            "transport": "stdio",
            "command": sys.executable,
            "args": [
                str(ROOT / "backend/tests/mcp_fixture.py"),
                "--pid-file",
                str(pid_file),
            ],
            "env": {"MCP_FIXTURE_TOKEN": "synthetic-frozen-secret"},
        }
        server = api("/mcp/servers", "POST", value)
        server_id = server["id"]
        tested = api(f"/mcp/servers/{server_id}/test", "POST")
        assert tested["tool_count"] == 4 and not tested["error"], tested
        pid = int(pid_file.read_text())
        wait_for(lambda: not process_alive(pid))
        echo = next(
            x
            for x in api("/tools")
            if x["server_id"] == server_id and x["name"] == "echo"
        )
        api(f"/tools/{echo['id']}", "PATCH", {"enabled": True})
        api(f"/mcp/servers/{server_id}", "PUT", {**value, "env": {}, "enabled": True})
        wait_for(
            lambda: (
                next(x for x in api("/mcp/servers") if x["id"] == server_id)["status"]
                == "connected"
            )
        )
        api(
            "/settings",
            "PUT",
            {
                "model_url": "http://127.0.0.1:8894/v1",
                "model_name": "mock-test",
                "model_key": "synthetic-frozen-model-key",
            },
        )
        conversation = api("/conversations", "POST", {})
        run = api(
            f"/conversations/{conversation['id']}/messages",
            "POST",
            {"content": "组合MCP，先计算再回显"},
        )
        wait_for(
            lambda: api(f"/runs/{run['id']}")["status"] not in {"queued", "running"}
        )
        assert api(f"/runs/{run['id']}")["status"] == "completed"
        events = api(f"/runs/{run['id']}/tools")
        assert [x["data"]["source"] for x in events] == ["builtin", "mcp"], events
        assert "synthetic-frozen-secret" not in json.dumps(events)
        api("/tools/calculate", "PATCH", {"enabled": False})
        process.terminate()
        process.wait(timeout=15)
        process = start(log)
        wait_for(
            lambda: (
                next(x for x in api("/mcp/servers") if x["id"] == server_id)["status"]
                == "connected"
            )
        )
        catalog = api("/tools")
        assert not next(x for x in catalog if x["id"] == "calculate")["enabled"]
        assert next(x for x in catalog if x["id"] == echo["id"])["enabled"]
        assert len(api(f"/runs/{run['id']}/tools")) == 2
        pid = int(pid_file.read_text())
        api(f"/mcp/servers/{server_id}", "DELETE")
        server_id = None
        wait_for(lambda: not process_alive(pid))
        (REVIEW / "standalone-verification.json").write_text(
            json.dumps(
                {
                    "frozen": True,
                    "systemPythonOnPath": False,
                    "stdioDiscovery": 4,
                    "mixedAgentRun": True,
                    "restartPreservedSelection": True,
                    "restartPreservedAudit": True,
                    "childReaped": True,
                    "secretsRedacted": True,
                },
                indent=2,
            )
        )
        print(
            "Frozen backend MCP, agent, restart and child cleanup verification passed"
        )
    finally:
        if process.poll() is None:
            if server_id:
                api(f"/mcp/servers/{server_id}", "DELETE")
            api(
                "/settings",
                "PUT",
                {
                    "model_url": "http://127.0.0.1:8894/v1",
                    "model_name": "mock-test",
                    "model_key": "",
                    "search_key": "",
                },
            )
            process.terminate()
            process.wait(timeout=15)
