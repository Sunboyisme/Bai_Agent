# 小汐接入 Deep Agents 的判断

评估日期：2026-10-17。此记录评估接入方式，当前代码仍使用 `create_agent`。

可以接入，也适合未来增加复杂任务能力；当前日常聊天、天气、提醒和微信消息，用现有 Agent 已能完成，换框架本身不会让这些功能更简单。

## 现有边界

- `backend/app/agent.py` 使用 LangChain `create_agent`，通过 `prepare_tools` 加载内置工具及 MCP 工具，输出消息流、工具记录和 token 用量。
- 聊天历史从 SQLite 读取最近 24 条消息；确认后的个人记忆从现有数据库注入。
- 学习流程通过独立 LangGraph 图及 SQLite checkpoint 维护练习和恢复状态。
- 微信登录、消息去重、投递状态和定时提醒属于渠道与应用服务，需要继续由这些服务负责。

## 能省下的工作

Deep Agents 基于 LangChain / LangGraph，提供文件上下文管理、子任务委派、历史压缩及 Skills 等能力。需要“查多份资料 → 拆解任务 → 分步处理 → 输出文件”时，可以减少自己组装这些能力的工作。任务规划可按所选版本显式启用。

对简单聊天，这些额外能力也可能增加提示词、工具数量、模型调用与调试成本；实际效果取决于模型的工具调用表现，不能仅凭框架名称判断。

## 建议接入顺序

1. 保留 FastAPI、Tauri、SQLite、MCP 管理、学习图与微信服务，抽出聊天 Agent 的构建入口。
2. 给复杂任务增加可切换的 Deep Agents 执行路径，日常消息沿用现有路径；用同一套 `prepare_tools` 保持工具开关与权限行为一致。
3. 在独立任务目录配置文件后端；通过现有记忆服务读取和写入用户记忆，避免出现第二套互不一致的持久记忆。
4. 适配任务、子任务和工具事件到现有 SSE 协议，并验证停止、失败恢复、最终答案去重与 token 统计。
5. 锁定兼容依赖后，对比实际模型下的成功率、调用次数、耗时和成本，再决定是否统一入口。

不能只把 `create_agent` 改成 `create_deep_agent` 就视为迁移完成。依赖兼容、流式事件、持久状态、工具边界和桌面后端封装都需要验收。

官方参考：[Deep Agents 概览](https://docs.langchain.com/oss/python/deepagents/overview)、[定制与中间件](https://docs.langchain.com/oss/python/deepagents/customization)。
