from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RecordRead(ReadModel):
    id: str
    created_at: str
    updated_at: str


class SettingsRead(BaseModel):
    model_url: str
    model_name: str
    vision_enabled: bool
    timezone: str
    memory_mode: Literal["auto", "confirm"]
    model_configured: bool
    search_configured: bool


class ToolRead(BaseModel):
    id: str
    name: str
    description: str
    available: bool
    note: str


class SettingsUpdate(BaseModel):
    model_url: HttpUrl
    model_name: str = Field(max_length=200)
    model_key: str | None = Field(default=None, max_length=4096)
    search_key: str | None = Field(default=None, max_length=4096)
    vision_enabled: bool = False
    timezone: str = "Asia/Shanghai"
    memory_mode: Literal["auto", "confirm"] | None = None

    @field_validator("model_url")
    @classmethod
    def credentials(cls, value):
        if value.username or value.password:
            raise ValueError("接口地址不能包含用户名或密码，请单独填写 API 密钥")
        return value

    @field_validator("timezone")
    @classmethod
    def zone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("无效时区")
        return value


class MemorySettingsUpdate(BaseModel):
    memory_mode: Literal["auto", "confirm"]


class ConversationCreate(BaseModel):
    title: str = Field(default="新对话", max_length=200)


class ConversationRead(RecordRead):
    title: str


class MessageRead(RecordRead):
    role: str
    content: str
    attachment_ids: list[str]


class ChatInput(BaseModel):
    content: str = Field(min_length=1, max_length=30000)
    attachment_ids: list[str] = Field(default_factory=list, max_length=4)


class RunRead(RecordRead):
    kind: str
    status: str
    conversation_id: str | None
    goal_id: str | None
    result: dict
    error: str | None
    usage: dict


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    objective: str = Field(default="", max_length=4000)
    foundation: str = Field(default="", max_length=4000)


class NodeRead(RecordRead):
    goal_id: str
    ordinal: int
    module: str
    title: str
    objective: str
    prerequisites: list[str]
    exercise_type: str
    criteria: str
    status: str
    review_at: str | None


class GoalRead(RecordRead):
    title: str
    objective: str
    foundation: str
    status: str
    course_version: int
    current_node_id: str | None
    nodes: list[NodeRead]


class LessonRead(RecordRead):
    node_id: str
    content: str
    exercise: str
    hints: list[str]
    criteria: str
    feedback: dict
    state: str


class Submission(BaseModel):
    submission_id: str = Field(min_length=1, max_length=100)
    answer: str = Field(max_length=30000)
    attachment_ids: list[str] = Field(default_factory=list, max_length=4)


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=6000)
    category: Literal["fact", "preference", "project"] = "fact"
    source: str = Field(default="用户手动记录", max_length=1000)
    state: Literal["confirmed", "candidate"] = "confirmed"
    revision: int | None = Field(default=None, ge=1)


class MemoryRead(RecordRead):
    content: str
    category: str
    source: str
    state: str
    evidence: str
    review_reason: str
    source_conversation_id: str | None
    source_message_id: str | None
    replaces_id: str | None
    revision: int


class MemoryConfirm(BaseModel):
    revision: int = Field(ge=1)


class ReminderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(default="", max_length=6000)
    due_at: datetime
    timezone: str = "Asia/Shanghai"
    recurrence: Literal["none", "daily", "weekly"] = "none"

    @field_validator("due_at")
    @classmethod
    def aware(cls, value):
        if value.tzinfo is None:
            raise ValueError("提醒时间必须包含时区")
        return value

    @field_validator("timezone")
    @classmethod
    def zone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("无效时区")
        return value


class ReminderRead(RecordRead):
    title: str
    body: str
    due_at: str
    timezone: str
    recurrence: str
    status: str


class ReminderAction(BaseModel):
    action: Literal["complete", "cancel", "snooze", "reactivate"]
    minutes: int = Field(default=10, ge=1, le=10080)


class NotificationRead(RecordRead):
    reminder_id: str
    occurrence_at: str
    title: str
    body: str
    status: str
    overdue: bool


class AttachmentRead(RecordRead):
    name: str
    media_type: str
    width: int
    height: int


class CourseNode(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    module: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    objective: str = Field(min_length=1, max_length=4000)
    prerequisites: list[str] = Field(default_factory=list)
    exercise_type: Literal["question", "practice", "case", "code"]
    criteria: str = Field(min_length=1, max_length=4000)


class CoursePlan(BaseModel):
    overview: str
    nodes: list[CourseNode] = Field(min_length=3, max_length=30)

    @field_validator("nodes")
    @classmethod
    def validate_order(cls, nodes):
        seen = set()
        for node in nodes:
            if node.key in seen or any(key not in seen for key in node.prerequisites):
                raise ValueError("知识点不能重名，前置知识点必须在当前点之前")
            seen.add(node.key)
        return nodes


class LessonContent(BaseModel):
    content: str = Field(min_length=1)
    exercise: str = Field(min_length=1)
    hints: list[str]
    criteria: str = Field(min_length=1)


class Feedback(BaseModel):
    passed: bool
    explanation: str
    strengths: list[str]
    gaps: list[str]
    next_step: str
    evidence: str
