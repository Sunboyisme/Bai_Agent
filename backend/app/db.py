from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import (
    create_engine,
    event,
    String,
    Text,
    JSON,
    Integer,
    Boolean,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import DATABASE_URL, PROFILE_ID


def uid() -> str:
    return str(uuid4())


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


class Base(DeclarativeBase):
    pass


class Record:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(String(36), default=PROFILE_ID, index=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now, onupdate=now)


class Settings(Base):
    __tablename__ = "settings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=PROFILE_ID)
    model_url: Mapped[str] = mapped_column(Text, default="https://api.openai.com/v1")
    model_name: Mapped[str] = mapped_column(String(200), default="")
    vision_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    timezone: Mapped[str] = mapped_column(String(100), default="Asia/Shanghai")
    memory_mode: Mapped[str] = mapped_column(String(20), default="auto")
    model_providers: Mapped[list] = mapped_column(JSON, default=list)
    default_provider: Mapped[str] = mapped_column(String(30), default="custom")


class Conversation(Record, Base):
    __tablename__ = "conversations"
    title: Mapped[str] = mapped_column(String(200), default="新对话")


class MCPServer(Record, Base):
    __tablename__ = "mcp_servers"
    __table_args__ = (UniqueConstraint("profile_id", "name"),)
    name: Mapped[str] = mapped_column(String(100))
    transport: Mapped[str] = mapped_column(String(30))
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    tested_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class MCPTool(Base):
    __tablename__ = "mcp_tools"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    server_id: Mapped[str] = mapped_column(
        ForeignKey("mcp_servers.id", ondelete="CASCADE"), index=True
    )
    remote_name: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    input_schema: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    present: Mapped[bool] = mapped_column(Boolean, default=True)


class BuiltinToolState(Base):
    __tablename__ = "builtin_tool_states"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Message(Record, Base):
    __tablename__ = "messages"
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    attachment_ids: Mapped[list] = mapped_column(JSON, default=list)
    provider_context: Mapped[dict] = mapped_column(JSON, default=dict)


class Run(Record, Base):
    __tablename__ = "runs"
    kind: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="queued")
    conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    goal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    usage: Mapped[dict] = mapped_column(JSON, default=dict)
    model_config: Mapped[dict] = mapped_column(JSON, default=dict)


class RunEvent(Base):
    __tablename__ = "run_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("runs.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(30))
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class Goal(Record, Base):
    __tablename__ = "goals"
    title: Mapped[str] = mapped_column(String(200))
    objective: Mapped[str] = mapped_column(Text, default="")
    foundation: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="draft")
    course_version: Mapped[int] = mapped_column(Integer, default=1)
    current_node_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class KnowledgeNode(Record, Base):
    __tablename__ = "knowledge_nodes"
    goal_id: Mapped[str] = mapped_column(
        ForeignKey("goals.id", ondelete="CASCADE"), index=True
    )
    ordinal: Mapped[int] = mapped_column(Integer)
    module: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(200))
    objective: Mapped[str] = mapped_column(Text)
    prerequisites: Mapped[list] = mapped_column(JSON, default=list)
    exercise_type: Mapped[str] = mapped_column(String(40), default="question")
    criteria: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="not_started")
    review_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Lesson(Record, Base):
    __tablename__ = "lessons"
    node_id: Mapped[str] = mapped_column(
        ForeignKey("knowledge_nodes.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(Text)
    exercise: Mapped[str] = mapped_column(Text)
    hints: Mapped[list] = mapped_column(JSON, default=list)
    criteria: Mapped[str] = mapped_column(Text)
    feedback: Mapped[dict] = mapped_column(JSON, default=dict)
    graph_thread_id: Mapped[str] = mapped_column(String(100), unique=True)
    state: Mapped[str] = mapped_column(String(30), default="awaiting_submission")


class Attempt(Record, Base):
    __tablename__ = "attempts"
    lesson_id: Mapped[str] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), index=True
    )
    submission_id: Mapped[str] = mapped_column(String(100), unique=True)
    answer: Mapped[str] = mapped_column(Text)
    attachment_ids: Mapped[list] = mapped_column(JSON, default=list)
    feedback: Mapped[dict] = mapped_column(JSON, default=dict)


class Memory(Record, Base):
    __tablename__ = "memories"
    content: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(30), default="fact")
    source: Mapped[str] = mapped_column(Text, default="用户手动记录")
    state: Mapped[str] = mapped_column(String(20), default="confirmed")
    evidence: Mapped[str] = mapped_column(Text, default="")
    review_reason: Mapped[str] = mapped_column(String(300), default="")
    source_conversation_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True
    )
    source_message_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    replaces_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    replaces_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class MemoryChange(Record, Base):
    __tablename__ = "memory_changes"
    memory_id: Mapped[str] = mapped_column(String(36), index=True)
    run_id: Mapped[str] = mapped_column(String(36), index=True)
    source_message_id: Mapped[str] = mapped_column(String(36), index=True)
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict] = mapped_column(JSON)
    undone: Mapped[bool] = mapped_column(Boolean, default=False)


class Reminder(Record, Base):
    __tablename__ = "reminders"
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, default="")
    due_at: Mapped[str] = mapped_column(String(40), index=True)
    timezone: Mapped[str] = mapped_column(String(100), default="Asia/Shanghai")
    recurrence: Mapped[str] = mapped_column(String(20), default="none")
    status: Mapped[str] = mapped_column(String(30), default="active")


class Notification(Record, Base):
    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("reminder_id", "occurrence_at"),)
    reminder_id: Mapped[str] = mapped_column(
        ForeignKey("reminders.id", ondelete="CASCADE"), index=True
    )
    occurrence_at: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    overdue: Mapped[bool] = mapped_column(Boolean, default=False)


class WechatState(Base):
    __tablename__ = "wechat_state"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class WechatInbox(Base):
    __tablename__ = "wechat_inbox"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    run_id: Mapped[str] = mapped_column(String(36))


class WechatDelivery(Record, Base):
    __tablename__ = "wechat_deliveries"
    source_key: Mapped[str] = mapped_column(Text, unique=True)
    account_id: Mapped[str] = mapped_column(Text)
    notification_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    error: Mapped[str] = mapped_column(Text, default="")


class Attachment(Record, Base):
    __tablename__ = "attachments"
    name: Mapped[str] = mapped_column(String(300))
    media_type: Mapped[str] = mapped_column(String(60))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 20}
    if DATABASE_URL.startswith("sqlite")
    else {},
)
if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")


Session = sessionmaker(engine, expire_on_commit=False)


def migrate() -> None:
    from alembic.config import Config
    from alembic import command
    from pathlib import Path

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    config.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))
    command.upgrade(config, "head")
    with Session() as db:
        if not db.get(Settings, PROFILE_ID):
            db.add(Settings(id=PROFILE_ID))
        # A crashed process cannot continue a half-finished provider request.
        for run in db.query(Run).filter(Run.status.in_(["queued", "running"])):
            run.status = "failed"
            run.error = "服务已重启，之前的执行被中断。请重试。"
        db.commit()
