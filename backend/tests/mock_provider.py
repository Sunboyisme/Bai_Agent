"""Local protocol fixture, never used by the application in normal operation."""

import json
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def reply(body):
    messages = body["messages"]
    system = str(messages[0].get("content", ""))
    user = str(
        next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    )
    if '"title": "CoursePlan"' in system:
        match = re.search(r"主题：([^\n]+)", user)
        topic = match.group(1) if match else "测试主题"
        nodes = [
            {
                "key": str(i),
                "module": "基础与实践",
                "title": f"{topic} · {name}",
                "objective": f"掌握{name}并能举例",
                "prerequisites": [str(i - 1)] if i else [],
                "exercise_type": "question",
                "criteria": "解释关键概念并给出具体例子",
            }
            for i, name in enumerate(["认识基础", "应用方法", "独立实践"])
        ]
        return {
            "content": json.dumps(
                {"overview": "测试课程：从基础到实践。", "nodes": nodes},
                ensure_ascii=False,
            )
        }
    if '"title": "LessonContent"' in system:
        return {
            "content": json.dumps(
                {
                    "content": "## 先理解，再动手\n这是隔离测试用的教学内容。概念用于描述事物，例子用于检验理解。",
                    "exercise": "用自己的话解释概念，并给一个具体例子。",
                    "hints": ["先描述用途，再举例。"],
                    "criteria": "概念解释清晰，例子具体。",
                },
                ensure_ascii=False,
            )
        }
    if '"title": "Feedback"' in system:
        passed = "不会" not in user.split("用户提交：")[-1]
        return {
            "content": json.dumps(
                {
                    "passed": passed,
                    "explanation": "测试反馈：已依据提交的文字检查。",
                    "strengths": ["提交了具体回答"] if passed else [],
                    "gaps": [] if passed else ["缺少具体例子"],
                    "next_step": "继续下一知识点" if passed else "补充例子后再练习",
                    "evidence": "仅检查本次文字或图片输入，未运行代码。",
                },
                ensure_ascii=False,
            )
        }
    last = messages[-1]
    if last["role"] == "tool":
        try:
            result = json.loads(last.get("content", "{}"))
        except json.JSONDecodeError:
            result = {}
        if isinstance(result, dict) and result.get("skipped"):
            return {"content": "好的，我们继续。"}
        if isinstance(result, dict) and result.get("state") == "candidate":
            return {"content": "这条信息需要你确认是否记住。"}
        return {"content": "工具已经执行，结果已保存。"}
    if "检查记忆背景" in user:
        return {
            "content": json.dumps(
                {
                    "preference_available": "我喜欢简短的回答" in system,
                    "private_available": "我有糖尿病" in system,
                },
                ensure_ascii=False,
            )
        }
    calls = []
    if "天气" in user:
        calls.append(("get_weather", {"city": "广州", "days": 3, "country_code": "CN"}))
    if "计算" in user:
        calls.append(("calculate", {"expression": "(199 + 89) * 0.85"}))
    if "换算" in user:
        calls.append(
            ("convert_units", {"value": "5", "from_unit": "mile", "to_unit": "km"})
        )
    if "日期" in user:
        calls.append(("date_time", {"value": "2026-10-15", "add_days": 30}))
    if calls:
        return {
            "content": None,
            "tool_calls": [
                {
                    "id": f"call_{index}",
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": json.dumps(arguments, ensure_ascii=False),
                    },
                }
                for index, (name, arguments) in enumerate(calls)
            ],
        }
    if "喜欢简短的回答" in user or "我有糖尿病" in user or "今天想吃清淡" in user:
        content = (
            "我有糖尿病"
            if "我有糖尿病" in user
            else "今天想吃清淡"
            if "今天想吃清淡" in user
            else "我喜欢简短的回答"
        )
        return {
            "content": None,
            "tool_calls": [
                {
                    "id": "call_memory_policy",
                    "type": "function",
                    "function": {
                        "name": "remember",
                        "arguments": json.dumps(
                            {
                                "content": content,
                                "category": "fact"
                                if "糖尿病" in content
                                else "preference",
                                "evidence": content,
                                # Deliberately normal: backend must independently guard private / temporary data.
                                "risk": "normal",
                            },
                            ensure_ascii=False,
                        ),
                    },
                }
            ],
        }
    if "记住" in user:
        return {
            "content": "我先保存这条记忆。",
            "tool_calls": [
                {
                    "id": "call_memory",
                    "type": "function",
                    "function": {
                        "name": "remember",
                        "arguments": json.dumps(
                            {
                                "content": "我喜欢先看例子再学习理论",
                                "category": "preference",
                                "explicit_request": True,
                            },
                            ensure_ascii=False,
                        ),
                    },
                }
            ],
        }
    if "我想学" in user:
        return {
            "content": None,
            "tool_calls": [
                {
                    "id": "call_course",
                    "type": "function",
                    "function": {
                        "name": "create_learning_goal",
                        "arguments": json.dumps(
                            {
                                "title": "学习做饭",
                                "objective": "能独立做晚餐",
                                "foundation": "",
                            },
                            ensure_ascii=False,
                        ),
                    },
                }
            ],
        }
    if "查资料" in user:
        return {
            "content": None,
            "tool_calls": [
                {
                    "id": "call_search",
                    "type": "function",
                    "function": {
                        "name": "web_search",
                        "arguments": '{"query":"前端官方资料"}',
                    },
                }
            ],
        }
    return {"content": "连接成功。这里是本地协议测试服务，没有调用真实模型。"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        message = reply(body)
        self.send_response(200)
        if not body.get("stream"):
            result = {
                "id": "mock-response",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": "mock-test",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", **message},
                        "finish_reason": "tool_calls"
                        if message.get("tool_calls")
                        else "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 20,
                    "total_tokens": 30,
                },
            }
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode())
            return
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()

        def chunk(delta, reason=None, usage=None):
            result = {
                "id": "mock-stream",
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": "mock-test",
                "choices": [{"index": 0, "delta": delta, "finish_reason": reason}],
            }
            if usage:
                result["usage"] = usage
            self.wfile.write(
                ("data: " + json.dumps(result, ensure_ascii=False) + "\n\n").encode()
            )
            self.wfile.flush()

        try:
            chunk({"role": "assistant"})
            for part in re.findall(r".{1,5}", message.get("content") or "", flags=re.S):
                chunk({"content": part})
            if message.get("tool_calls"):
                chunk(
                    {
                        "tool_calls": [
                            {"index": i, **call}
                            for i, call in enumerate(message["tool_calls"])
                        ]
                    }
                )
            chunk(
                {},
                "tool_calls" if message.get("tool_calls") else "stop",
                {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
            )
            self.wfile.write(b"data: [DONE]\n\n")
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == "__main__":
    print("Synthetic provider at http://127.0.0.1:8877/v1", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8877), Handler).serve_forever()
