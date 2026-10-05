import asyncio
import contextlib
import hmac
import io
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command
from PIL import Image, ImageOps, UnidentifiedImageError
from . import db as store, schemas as s, provider, learning, runs, agent, reminders
from .config import (
    AUTH_TOKEN,
    DATA_DIR,
    ATTACHMENTS_DIR,
    PROFILE_ID,
    secret_get,
    secret_set,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.migrate()
    async with AsyncSqliteSaver.from_conn_string(
        str(DATA_DIR / "checkpoints.sqlite")
    ) as saver:
        await saver.setup()
        app.state.tutor = learning.build_graph(saver)
        scheduler = AsyncIOScheduler(timezone="UTC")
        scheduler.add_job(
            reminders.tick,
            "interval",
            seconds=3,
            id="reminders",
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        await reminders.tick()
        yield
        scheduler.shutdown(wait=False)
        outstanding = list(runs.tasks.values())
        for task in outstanding:
            task.cancel()
        if outstanding:
            await asyncio.gather(*outstanding, return_exceptions=True)


app = FastAPI(title="Bai Agent API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5186",
        "http://localhost:5186",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
    ],
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


def auth(request: Request):
    value = request.headers.get("Authorization", "")
    if not hmac.compare_digest(value, "Bearer " + AUTH_TOKEN):
        raise HTTPException(401, "应用连接未认证，请通过 Bai Agent 启动。")


def database():
    with store.Session() as db:
        yield db


def item(db, model, item_id):
    value = db.get(model, item_id)
    if not value or getattr(value, "profile_id", PROFILE_ID) != PROFILE_ID:
        raise HTTPException(404, "记录不存在")
    return value


def goal_read(db, goal):
    values = {
        key: getattr(goal, key) for key in s.GoalRead.model_fields if key != "nodes"
    }
    nodes = [
        s.NodeRead.model_validate(n)
        for n in db.scalars(
            select(store.KnowledgeNode)
            .where(store.KnowledgeNode.goal_id == goal.id)
            .order_by(store.KnowledgeNode.ordinal)
        )
    ]
    return s.GoalRead(**values, nodes=nodes)


def settings_read(db):
    value = db.get(store.Settings, PROFILE_ID)
    return s.SettingsRead(
        model_url=value.model_url,
        model_name=value.model_name,
        vision_enabled=value.vision_enabled,
        timezone=value.timezone,
        model_configured=bool(value.model_name.strip() and secret_get("model")),
        search_configured=bool(secret_get("search")),
    )


def create_run(db, kind, conversation_id=None, goal_id=None):
    query = select(store.Run).where(store.Run.status.in_(["queued", "running"]))
    query = (
        query.where(store.Run.conversation_id == conversation_id)
        if conversation_id
        else query.where(store.Run.goal_id == goal_id)
    )
    if db.scalar(query):
        raise HTTPException(409, "当前还有任务正在执行，请等待或停止后重试。")
    value = store.Run(kind=kind, conversation_id=conversation_id, goal_id=goal_id)
    db.add(value)
    db.commit()
    return value


@app.get("/api/v1/health")
def health():
    return {"service": "bai-agent", "version": "0.1.0"}


from fastapi import APIRouter

router = APIRouter(prefix="/api/v1", dependencies=[Depends(auth)])


@router.get("/settings", response_model=s.SettingsRead)
def get_settings(db=Depends(database)):
    return settings_read(db)


@router.put("/settings", response_model=s.SettingsRead)
def update_settings(value: s.SettingsUpdate, db=Depends(database)):
    try:
        secret_set("model", value.model_key)
        secret_set("search", value.search_key)
    except Exception:
        raise HTTPException(
            503, "系统凭据存储不可用，密钥未写入普通文件。请检查 Windows 凭据管理。"
        )
    settings = db.get(store.Settings, PROFILE_ID)
    settings.model_url = str(value.model_url).rstrip("/")
    settings.model_name = value.model_name.strip()
    settings.vision_enabled = value.vision_enabled
    settings.timezone = value.timezone
    db.commit()
    return settings_read(db)


@router.post("/settings/test")
async def test_connection():
    try:
        from langchain_core.messages import HumanMessage

        await provider.model().ainvoke([HumanMessage(content="请只回复：连接成功")])
        return {"ok": True, "message": "模型接口连接成功"}
    except Exception as error:
        raise HTTPException(400, provider.safe_error(error))


@router.get("/conversations", response_model=list[s.ConversationRead])
def conversations(db=Depends(database)):
    return db.scalars(
        select(store.Conversation).order_by(store.Conversation.updated_at.desc())
    ).all()


@router.post("/conversations", response_model=s.ConversationRead)
def new_conversation(value: s.ConversationCreate, db=Depends(database)):
    record = store.Conversation(title=value.title)
    db.add(record)
    db.commit()
    return record


@router.get(
    "/conversations/{conversation_id}/messages", response_model=list[s.MessageRead]
)
def messages(conversation_id: str, db=Depends(database)):
    item(db, store.Conversation, conversation_id)
    return db.scalars(
        select(store.Message)
        .where(store.Message.conversation_id == conversation_id)
        .order_by(store.Message.created_at)
    ).all()


@router.post("/conversations/{conversation_id}/messages", response_model=s.RunRead)
async def send_message(conversation_id: str, value: s.ChatInput, db=Depends(database)):
    conversation = item(db, store.Conversation, conversation_id)
    try:
        provider.model()
        provider.user_content(value.content, value.attachment_ids)
    except Exception as error:
        raise HTTPException(400, provider.safe_error(error))
    run = create_run(db, "chat", conversation_id=conversation_id)
    db.add(
        store.Message(
            conversation_id=conversation_id,
            role="user",
            content=value.content,
            attachment_ids=value.attachment_ids,
        )
    )
    if conversation.title == "新对话":
        conversation.title = value.content[:30]
    conversation.updated_at = store.now()
    db.commit()
    runs.launch(run.id, lambda: agent.chat(run.id, conversation_id))
    return run


@router.post("/conversations/{conversation_id}/retry", response_model=s.RunRead)
async def retry_message(conversation_id: str, db=Depends(database)):
    item(db, store.Conversation, conversation_id)
    latest = db.scalar(
        select(store.Message)
        .where(store.Message.conversation_id == conversation_id)
        .order_by(store.Message.created_at.desc())
    )
    if not latest or latest.role != "user":
        raise HTTPException(409, "没有需要重试的消息")
    run = create_run(db, "chat", conversation_id=conversation_id)
    runs.launch(run.id, lambda: agent.chat(run.id, conversation_id))
    return run


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, db=Depends(database)):
    record = item(db, store.Conversation, conversation_id)
    if db.scalar(
        select(store.Run).where(
            store.Run.conversation_id == conversation_id,
            store.Run.status.in_(["queued", "running"]),
        )
    ):
        raise HTTPException(409, "请先停止正在执行的对话")
    db.delete(record)
    db.commit()
    return {"deleted": True}


@router.get("/runs", response_model=list[s.RunRead])
def list_runs(
    conversation_id: str | None = None, goal_id: str | None = None, db=Depends(database)
):
    query = select(store.Run).order_by(store.Run.created_at.desc()).limit(30)
    if conversation_id:
        query = query.where(store.Run.conversation_id == conversation_id)
    if goal_id:
        query = query.where(store.Run.goal_id == goal_id)
    return db.scalars(query).all()


@router.get("/runs/{run_id}", response_model=s.RunRead)
def get_run(run_id: str, db=Depends(database)):
    return item(db, store.Run, run_id)


@router.post("/runs/{run_id}/cancel", response_model=s.RunRead)
def cancel_run(run_id: str, db=Depends(database)):
    value = item(db, store.Run, run_id)
    task = runs.tasks.get(run_id)
    if task:
        task.cancel()
    return value


@router.get("/runs/{run_id}/events")
async def run_events(
    run_id: str, request: Request, after: int = 0, db=Depends(database)
):
    item(db, store.Run, run_id)

    async def stream():
        cursor = after
        while not await request.is_disconnected():
            with store.Session() as session:
                events = session.scalars(
                    select(store.RunEvent)
                    .where(store.RunEvent.run_id == run_id, store.RunEvent.id > cursor)
                    .order_by(store.RunEvent.id)
                ).all()
                run = session.get(store.Run, run_id)
            for event in events:
                cursor = event.id
                yield f"id: {event.id}\ndata: {json.dumps({'kind': event.kind, 'data': event.data}, ensure_ascii=False)}\n\n"
            if run.status not in ("queued", "running"):
                break
            if not events:
                yield ": keepalive\n\n"
            await asyncio.sleep(0.25)

    return StreamingResponse(
        stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )


@router.get("/learning/goals", response_model=list[s.GoalRead])
def goals(db=Depends(database)):
    return [
        goal_read(db, x)
        for x in db.scalars(select(store.Goal).order_by(store.Goal.updated_at.desc()))
    ]


@router.post("/learning/goals", response_model=s.GoalRead)
def create_goal(value: s.GoalCreate, db=Depends(database)):
    goal = store.Goal(**value.model_dump())
    db.add(goal)
    db.commit()
    return goal_read(db, goal)


@router.get("/learning/goals/{goal_id}", response_model=s.GoalRead)
def get_goal(goal_id: str, db=Depends(database)):
    return goal_read(db, item(db, store.Goal, goal_id))


@router.post("/learning/goals/{goal_id}/plan", response_model=s.RunRead)
async def plan_course(goal_id: str, db=Depends(database)):
    item(db, store.Goal, goal_id)
    if db.scalar(
        select(store.KnowledgeNode).where(store.KnowledgeNode.goal_id == goal_id)
    ):
        raise HTTPException(409, "已有课程，不会覆盖当前进度")
    run = create_run(db, "course", goal_id=goal_id)
    runs.launch(run.id, lambda: learning.generate_course(goal_id))
    return run


@router.delete("/learning/goals/{goal_id}")
def delete_goal(goal_id: str, db=Depends(database)):
    goal = item(db, store.Goal, goal_id)
    if db.scalar(
        select(store.Run).where(
            store.Run.goal_id == goal_id, store.Run.status.in_(["queued", "running"])
        )
    ):
        raise HTTPException(409, "请先停止当前学习任务")
    db.delete(goal)
    db.commit()
    return {"deleted": True}


@router.get("/learning/nodes/{node_id}/lesson", response_model=s.LessonRead | None)
def get_lesson(node_id: str, db=Depends(database)):
    item(db, store.KnowledgeNode, node_id)
    return db.scalar(
        select(store.Lesson)
        .where(store.Lesson.node_id == node_id)
        .order_by(store.Lesson.created_at.desc())
    )


@router.post("/learning/nodes/{node_id}/lesson", response_model=s.RunRead)
async def teach_node(node_id: str, request: Request, db=Depends(database)):
    node = item(db, store.KnowledgeNode, node_id)
    previous = db.scalar(
        select(store.Lesson)
        .where(store.Lesson.node_id == node_id)
        .order_by(store.Lesson.created_at.desc())
    )
    if previous and previous.state == "awaiting_submission":
        raise HTTPException(409, "当前练习尚未提交，请继续已有教学")
    run = create_run(db, "lesson", goal_id=node.goal_id)
    lesson_id = store.uid()

    async def operation():
        await request.app.state.tutor.ainvoke(
            {"node_id": node_id, "lesson_id": lesson_id},
            config={"configurable": {"thread_id": lesson_id}},
        )
        return {"lesson_id": lesson_id, "node_id": node_id}

    runs.launch(run.id, operation)
    return run


@router.post("/learning/lessons/{lesson_id}/submit", response_model=s.RunRead)
async def submit(
    lesson_id: str, value: s.Submission, request: Request, db=Depends(database)
):
    lesson = item(db, store.Lesson, lesson_id)
    if not value.answer.strip() and not value.attachment_ids:
        raise HTTPException(422, "请输入回答或提交图片")
    previous = db.scalar(
        select(store.Attempt).where(store.Attempt.submission_id == value.submission_id)
    )
    if previous:
        raise HTTPException(409, "这份练习已经提交，请查看保存的反馈")
    if lesson.state != "awaiting_submission":
        raise HTTPException(409, "这次练习已有反馈，请开始一次新练习")
    try:
        provider.user_content(value.answer, value.attachment_ids)
    except Exception as error:
        raise HTTPException(400, provider.safe_error(error))
    node = item(db, store.KnowledgeNode, lesson.node_id)
    run = create_run(db, "assessment", goal_id=node.goal_id)

    async def operation():
        # Failed assessment leaves a checkpoint at the assessment node, not a new interrupt.
        config = {"configurable": {"thread_id": lesson.graph_thread_id}}
        state = await request.app.state.tutor.aget_state(config)
        command = (
            Command(resume=value.model_dump())
            if "await_submission" in state.next
            else None
        )
        if command is None:
            await request.app.state.tutor.aupdate_state(
                config, {"submission": value.model_dump()}
            )
        result = await request.app.state.tutor.ainvoke(command, config=config)
        return {"lesson_id": lesson_id, "feedback": result.get("feedback", {})}

    runs.launch(run.id, operation)
    return run


@router.post("/learning/nodes/{node_id}/skip", response_model=s.NodeRead)
def skip_node(node_id: str, db=Depends(database)):
    node = item(db, store.KnowledgeNode, node_id)
    if db.scalar(
        select(store.Run).where(
            store.Run.goal_id == node.goal_id,
            store.Run.status.in_(["queued", "running"]),
        )
    ):
        raise HTTPException(409, "请先停止当前学习任务")
    node.status = "skipped"
    for lesson in db.scalars(
        select(store.Lesson).where(
            store.Lesson.node_id == node_id, store.Lesson.state == "awaiting_submission"
        )
    ):
        lesson.state = "skipped"
    goal = item(db, store.Goal, node.goal_id)
    nodes = db.scalars(
        select(store.KnowledgeNode).where(store.KnowledgeNode.goal_id == node.goal_id)
    ).all()
    if all(n.status in ("passed", "skipped") for n in nodes):
        goal.status = "completed"
    db.commit()
    return node


@router.get("/memories", response_model=list[s.MemoryRead])
def memories(db=Depends(database)):
    return db.scalars(
        select(store.Memory).order_by(store.Memory.updated_at.desc())
    ).all()


@router.post("/memories", response_model=s.MemoryRead)
def add_memory(value: s.MemoryCreate, db=Depends(database)):
    record = store.Memory(**value.model_dump())
    db.add(record)
    db.commit()
    return record


@router.put("/memories/{memory_id}", response_model=s.MemoryRead)
def edit_memory(memory_id: str, value: s.MemoryCreate, db=Depends(database)):
    record = item(db, store.Memory, memory_id)
    for key, val in value.model_dump().items():
        setattr(record, key, val)
    db.commit()
    return record


@router.delete("/memories/{memory_id}")
def remove_memory(memory_id: str, db=Depends(database)):
    db.delete(item(db, store.Memory, memory_id))
    db.commit()
    return {"deleted": True}


@router.get("/reminders", response_model=list[s.ReminderRead])
def reminder_list(db=Depends(database)):
    return db.scalars(select(store.Reminder).order_by(store.Reminder.due_at)).all()


@router.post("/reminders", response_model=s.ReminderRead)
def add_reminder(value: s.ReminderCreate, db=Depends(database)):
    record = store.Reminder(
        **value.model_dump(exclude={"due_at"}), due_at=reminders.utc_text(value.due_at)
    )
    db.add(record)
    db.commit()
    return record


@router.put("/reminders/{reminder_id}", response_model=s.ReminderRead)
def edit_reminder(reminder_id: str, value: s.ReminderCreate, db=Depends(database)):
    record = item(db, store.Reminder, reminder_id)
    reminders.invalidate_notifications(db, record.id)
    for key, val in value.model_dump(exclude={"due_at"}).items():
        setattr(record, key, val)
    record.due_at = reminders.utc_text(value.due_at)
    record.status = "active"
    db.commit()
    return record


@router.post("/reminders/{reminder_id}/action", response_model=s.ReminderRead)
def reminder_action(reminder_id: str, value: s.ReminderAction, db=Depends(database)):
    record = item(db, store.Reminder, reminder_id)
    reminders.invalidate_notifications(db, record.id)
    if value.action == "snooze":
        record.due_at = reminders.utc_text(
            datetime.now(timezone.utc) + timedelta(minutes=value.minutes)
        )
        record.status = "active"
    else:
        record.status = {
            "complete": "completed",
            "cancel": "cancelled",
            "reactivate": "active",
        }[value.action]
    db.commit()
    return record


@router.get("/notifications", response_model=list[s.NotificationRead])
def notifications(pending_only: bool = False, db=Depends(database)):
    query = (
        select(store.Notification)
        .where(store.Notification.status != "cancelled")
        .order_by(store.Notification.created_at.desc())
        .limit(50)
    )
    if pending_only:
        query = query.where(store.Notification.status == "pending")
    return db.scalars(query).all()


@router.post("/notifications/{notification_id}/ack", response_model=s.NotificationRead)
def ack_notification(notification_id: str, read: bool = False, db=Depends(database)):
    record = item(db, store.Notification, notification_id)
    if record.status != "cancelled":
        record.status = "read" if read or record.status == "read" else "presented"
    db.commit()
    return record


@router.post("/attachments", response_model=s.AttachmentRead)
async def upload(file: UploadFile = File(...), db=Depends(database)):
    raw = await file.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(413, "图片不能超过 10 MB")
    try:
        image = Image.open(io.BytesIO(raw))
        if image.width * image.height > 25_000_000:
            raise ValueError("图片像素过大")
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((2048, 2048))
        record = store.Attachment(
            name=Path(file.filename or "图片.jpg").name[:300],
            media_type="image/jpeg",
            width=image.width,
            height=image.height,
        )
        db.add(record)
        db.flush()
        image.save(ATTACHMENTS_DIR / f"{record.id}.jpg", "JPEG", quality=88)
        db.commit()
        return record
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "无法读取图片，请上传有效的 JPG、PNG 或 WebP 图片")


@router.get("/attachments/{attachment_id}/content")
def attachment_content(attachment_id: str, db=Depends(database)):
    record = item(db, store.Attachment, attachment_id)
    return FileResponse(ATTACHMENTS_DIR / f"{record.id}.jpg", media_type="image/jpeg")


app.include_router(router)
