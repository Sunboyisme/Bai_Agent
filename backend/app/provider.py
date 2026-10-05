import base64
import json
import re
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel
from .db import Session, Settings, Attachment
from .config import PROFILE_ID, ATTACHMENTS_DIR, secret_get


class ConfigurationError(Exception):
    pass


def model() -> ChatOpenAI:
    with Session() as db:
        settings = db.get(Settings, PROFILE_ID)
        key = secret_get("model")
        if not key or not settings.model_name.strip():
            raise ConfigurationError("请先在「连接与设置」中填写模型名称与 API 密钥。")
        return ChatOpenAI(
            model=settings.model_name.strip(),
            api_key=key,
            base_url=settings.model_url.rstrip("/"),
            timeout=75,
            max_retries=1,
        )


def user_content(text: str, attachment_ids: list[str] | None = None):
    if not attachment_ids:
        return text
    with Session() as db:
        settings = db.get(Settings, PROFILE_ID)
        if not settings.vision_enabled:
            raise ConfigurationError(
                "当前模型未启用图片输入。请在设置中确认模型支持图片，或改用文字描述。"
            )
        content = [{"type": "text", "text": text}]
        for attachment_id in attachment_ids:
            item = db.get(Attachment, attachment_id)
            if not item or item.profile_id != PROFILE_ID:
                raise ValueError("图片不存在")
            raw = (ATTACHMENTS_DIR / f"{item.id}.jpg").read_bytes()
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/jpeg;base64,"
                        + base64.b64encode(raw).decode()
                    },
                }
            )
        return content


async def ask_json(
    schema: type[BaseModel], instructions: str, text: str, attachment_ids=None
) -> BaseModel:
    llm = model()
    messages = [
        SystemMessage(
            content=instructions
            + "\n只返回符合以下 Schema 的 JSON。不要使用 Markdown 代码块。\n"
            + json.dumps(schema.model_json_schema(), ensure_ascii=False)
        ),
        HumanMessage(content=user_content(text, attachment_ids)),
    ]
    for attempt in range(2):
        response = await llm.ainvoke(messages)
        raw = (
            response.content
            if isinstance(response.content, str)
            else json.dumps(response.content, ensure_ascii=False)
        )
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
        try:
            return schema.model_validate_json(raw)
        except ValueError:
            if attempt:
                raise ValueError("模型返回的结构不符合要求，请重试。未保存不完整内容。")
            messages.extend(
                [
                    response,
                    HumanMessage(
                        content="返回结构校验失败。请修正为符合 Schema 的完整 JSON，特别检查必填字段和前置知识点顺序。"
                    ),
                ]
            )


def safe_error(error: Exception) -> str:
    if isinstance(error, ConfigurationError):
        return str(error)[:600]
    if isinstance(error, ValueError):
        known = (
            "图片不存在",
            "模型返回的结构不符合要求",
            "模型未返回文字",
            "已有课程",
            "提交编号已被其他练习使用",
        )
        if str(error).startswith(known):
            return str(error)[:600]
        return "输入参数或模型返回格式不符合要求，请检查后重试。"
    status = getattr(error, "status_code", None)
    if status in (401, 403):
        return "接口认证失败，请检查密钥与接口地址。"
    if status == 429:
        return "接口额度不足或请求过于频繁，请稍后重试。"
    if status == 400:
        return "服务商不接受当前请求，请检查模型名称、图片支持和工具调用能力。"
    return "请求未完成，请检查网络、接口地址与模型能力后重试。"
