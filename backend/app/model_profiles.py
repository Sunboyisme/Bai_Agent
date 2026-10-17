"""Non-secret provider presets and validated model selection."""
from copy import deepcopy
from urllib.parse import urlsplit

PRESETS = [
    ("bailian", "阿里云百炼", "https://dashscope.aliyuncs.com/compatible-mode/v1", ["qwen-plus"]),
    ("deepseek", "DeepSeek", "https://api.deepseek.com/v1", ["deepseek-flash", "deepseek-v4-pro"]),
    ("kimi", "Kimi", "https://api.moonshot.cn/v1", ["kimi-k2.6"]),
    ("zhipu", "智谱", "https://open.bigmodel.cn/api/paas/v4", ["glm-4.7", "glm-4.7-flash"]),
    ("siliconflow", "硅基流动", "https://api.siliconflow.cn/v1", ["Qwen/Qwen3-8B"]),
    ("custom", "自定义兼容接口", "https://api.openai.com/v1", []),
]


def secret_ref(provider_id):
    # Existing credentials stay where they are; no migration to plaintext.
    return "model" if provider_id == "custom" else f"model:{provider_id}"


def thinking_control(url, model):
    mode = model.get("thinking_mode", "auto")
    if mode != "auto":
        return mode
    host = urlsplit(url).hostname or ""
    name = model["name"].lower()
    if host == "api.deepseek.com" and name.startswith("deepseek-"):
        return "thinking"
    if host in {"api.moonshot.cn", "api.moonshot.ai"}:
        if name.startswith(("kimi-k3", "kimi-k2.7-code")):
            return "always"
        if name.startswith(("kimi-k2.5", "kimi-k2.6")):
            return "thinking"
        if "thinking" in name:
            return "always"
    if host == "open.bigmodel.cn":
        if name.startswith("glm-5.3"):
            return "always"
        if name.startswith(("glm-4.5", "glm-4.6", "glm-4.7", "glm-5")):
            return "thinking"
    if host == "api.siliconflow.cn" and name.startswith("qwen/qwen3-"):
        if "thinking" in name:
            return "always"
        if "instruct" not in name:
            return "enable_thinking"
    if host.endswith("aliyuncs.com") and (name in {"qwen-plus", "qwen-flash"} or name.startswith(("qwen3", "qwen-plus-2025"))):
        if "thinking" in name:
            return "always"
        if "instruct" not in name:
            return "enable_thinking"
    return "none"


def profiles(settings):
    values = deepcopy(settings.model_providers or [])
    if not any(x["id"] == "custom" for x in values) and settings.default_provider == "custom" and settings.model_name:
        values.append({"id": "custom", "provider_type": "custom", "label": "原有模型连接", "model_url": settings.model_url,
                       "default_model": settings.model_name, "models": [{"name": settings.model_name, "vision_enabled": settings.vision_enabled, "thinking_mode": "auto"}]})
    for value in values:
        preset = next((x for x in PRESETS if x[0] == value.get("provider_type", value["id"])), PRESETS[-1])
        value.setdefault("provider_type", preset[0])
        value["label"] = value.get("label") or preset[1]
        for model in value["models"]:
            model["thinking_control"] = thinking_control(value["model_url"], model)
    return values


def presets():
    return [{"id": id, "label": label, "model_url": url, "models": [{"name": name} for name in names]}
            for id, label, url, names in PRESETS]


def resolve(settings, selection=None):
    provider_id = selection.provider_id if selection else settings.default_provider
    profile = next((x for x in profiles(settings) if x["id"] == provider_id), None)
    name = selection.model_name if selection else profile["default_model"] if profile else ""
    model = next((x for x in profile["models"] if x["name"] == name), None) if profile else None
    if not model:
        raise ValueError("请先添加模型并选择默认模型。")
    enabled = bool(selection and selection.thinking_enabled)
    if enabled and model["thinking_control"] == "none":
        raise ValueError("这个模型尚未配置思考开关，请到模型设置选择支持的参数。")
    return {
        "provider_id": provider_id, "model_url": profile["model_url"],
        "model_name": name, "vision_enabled": model["vision_enabled"],
        "thinking_control": model["thinking_control"],
        "thinking_enabled": enabled or model["thinking_control"] == "always",
    }


def sync_default(settings):
    profile = next((x for x in profiles(settings) if x["id"] == settings.default_provider), None)
    if not profile:
        settings.model_url = "https://api.openai.com/v1"
        settings.model_name = ""
        settings.vision_enabled = False
        return
    model = next((x for x in profile["models"] if x["name"] == profile["default_model"]), None)
    settings.model_url = profile["model_url"]
    settings.model_name = profile["default_model"]
    settings.vision_enabled = bool(model and model["vision_enabled"])
