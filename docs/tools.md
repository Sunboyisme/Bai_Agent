# 对话工具箱

用户输入自然语言 → FastAPI 创建 Run → LangChain Agent 选择工具及参数 → Python 执行工具 → 工具结果返回模型 → SSE 显示回答及调用记录。工具不依赖点击首页按钮，首页与工具菜单只负责填写示例。模型需支持工具调用。

`backend/app/tools.py` 的 `build_tools(run_id, conversation_id)` 返回可直接交给 `create_agent` 的工具列表；`TOOL_INFO` 保存菜单描述。`GET /api/v1/tools` 返回当前工具配置状态，复用原有本机认证。`GET /api/v1/runs/{run_id}/tools` 返回已持久化的调用结果，供重新进入对话时恢复最近一轮记录。

| 工具 | 用途 | 外部配置 |
| --- | --- | --- |
| `get_weather` | 城市当前天气、未来 1–7 天预报 | 无需密钥，需要网络 |
| `web_search`、`read_url` | 联网检索、提取公开网页正文 | Tavily 密钥 |
| `calculate` | 十进制算式、括号、幂、整除、余数 | 无 |
| `date_time` | 当前时间、日期偏移、时区换算、日期间隔 | 无 |
| `convert_units` | 长度、重量、体积、温度、速度、时长换算 | 无 |
| `search_memories`、`remember` | 查询与保存记忆 | 无 |
| `create_reminder`、`list_reminders`、`cancel_reminder` | 安排、查看和取消提醒 | 无 |
| `learning_goals`、`create_learning_goal` | 查询学习进度、生成并保存学习路线 | 课程生成使用已配置模型 |

天气适配在 `backend/app/weather.py`：先查询城市坐标，再查询预报；返回具体地点、当地时间、单位、获取时间及来源 URL。同名地点返回候选列表，Agent 应先询问用户，再传入候选的 `location_id`。未找到城市、数据不完整、网络错误均明确报告。当前天气来自气象模型，不能当成气象站实测；公开服务按个人使用方式接入。

接口规范：[Open-Meteo 地理编码](https://open-meteo.com/en/docs/geocoding-api)、[Open-Meteo 预报](https://open-meteo.com/en/docs)、[Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)。

本地计算在 `backend/app/utilities.py`：算式解析 AST，只允许数字和算术运算，不调用 `eval`；限制输入长度、节点数、幂与结果范围，使用 28 位 Decimal 精度。日期输入为 ISO 8601，默认北京时间；无 UTC 偏移的时间按指定时区解释，跨夏令时的模糊时间要求明确偏移。日期间隔返回实际经过秒数及对应 24 小时天数。单位换算拒绝跨类别、不支持的单位、非有限数和低于绝对零度的温度。

工具结果写入 RunEvent 并通过 SSE 呈现。外部服务失败返回结构化错误，工具记录区显示「调用失败」。记忆和提醒保持原有授权规则：明确要求才直接保存记忆或安排/取消提醒；自动归纳的记忆保留为待确认。

扩展时添加有明确参数说明的 `@tool` 函数，在 `build_tools` 和 `TOOL_INFO` 中注册，并为菜单添加示例。后端测试检查注册工具与菜单一致、实际 LangChain 工具循环、错误结果与记录持久化；天气和搜索使用 MockTransport 或本地模拟模型，未验证真实服务商的回答质量。
