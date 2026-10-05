import asyncio
from collections.abc import Awaitable, Callable
from .db import Session, Run, RunEvent
from .provider import safe_error

tasks: dict[str, asyncio.Task] = {}


def emit(run_id: str, kind: str, data: dict):
    with Session() as db:
        db.add(RunEvent(run_id=run_id, kind=kind, data=data))
        db.commit()


def launch(run_id: str, operation: Callable[[], Awaitable[dict]]):
    async def execute():
        try:
            with Session() as db:
                db.get(Run, run_id).status = "running"
                db.commit()
            emit(run_id, "status", {"status": "running"})
            async with asyncio.timeout(240):
                result = await operation()
            with Session() as db:
                run = db.get(Run, run_id)
                run.status = "completed"
                run.result = result
                db.commit()
            emit(run_id, "done", {"result": result})
        except asyncio.CancelledError:
            with Session() as db:
                run = db.get(Run, run_id)
                run.status = "cancelled"
                db.commit()
            emit(run_id, "cancelled", {})
        except Exception as error:
            message = (
                "执行超时，请缩小问题范围后重试。"
                if isinstance(error, TimeoutError)
                else safe_error(error)
            )
            with Session() as db:
                run = db.get(Run, run_id)
                run.status = "failed"
                run.error = message
                db.commit()
            emit(run_id, "error", {"message": message})
        finally:
            tasks.pop(run_id, None)

    tasks[run_id] = asyncio.create_task(execute())
