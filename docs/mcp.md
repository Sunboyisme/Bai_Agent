# MCP 与统一工具管理

打开「设置 → 工具」。内置工具和 MCP 工具共用聊天入口、开关与调用记录；使用时直接表达需求，Agent 自行选择已启用且可用的工具。执行前会再次检查开关。

## 添加服务

- **远程 HTTP**：填写 Streamable HTTP MCP 地址，需要认证时添加请求头，例如 `Authorization` / `Bearer 你的令牌` 或服务提供的 `X-API-Key`。URL 不接受用户名、密码、查询参数或片段。
- **本地 stdio**：填写启动命令、JSON 参数数组，可指定绝对工作目录及环境变量。Node、Python、服务脚本等依赖由你准备；小汐不额外安装运行环境。安装版自带的 Python 后端不作为第三方 MCP 的通用解释器。

新增或导入的服务默认停用。保存配置不会启动进程或访问远程服务。「测试 / 刷新工具」只做握手和工具发现，不调用业务工具；停用服务测试完立即释放连接。测试通过后，勾选需要的工具，再启用服务。

启用的服务会连接，应用重启后恢复连接。启用工具表示允许 Agent 按聊天需求调用，不会逐次弹审批框。刷新后新发现的工具默认关闭，已有工具的选择保留；服务移除的工具不再提供给模型。

## JSON 导入

点击「导入 JSON」，粘贴配置，再预览、确认导入。预览在前端进行，不请求服务、不展示凭据值；同名服务需要重命名，不会覆盖。

```json
{
  "mcpServers": {
    "远程示例": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer 请替换为实际令牌" }
    },
    "本地示例": {
      "command": "node",
      "args": ["C:\\MCP\\my-server\\index.js"],
      "cwd": "C:\\MCP\\my-server",
      "env": { "SERVICE_API_KEY": "请替换为实际密钥" }
    }
  }
}
```

示例地址和脚本需替换成实际服务。支持字段：`command`、`args`、`cwd`、`env`、`url`、`headers` 及可选 `type` / `transport`；不能同时提供两个传输字段，不识别的字段会报错。环境变量按填写内容传递，不自动展开 `${变量}`。

Header 和环境变量值保存在当前数据空间对应的 Windows 凭据管理项中，数据库只保存引用。接口只返回字段名称及是否已设置；编辑时留空保持已有值，点击移除并保存才删除。切换传输类型时清除不适用的凭据。凭据不作为工具参数提供给模型，配置凭据会从结果和调用记录中脱敏。本地子进程只继承必要系统变量与明确配置的环境变量，不继承小汐模型密钥。

## 结果与错误

聊天下方可展开工具记录，查看来源服务、耗时、结果摘要及失败或取消状态，重新打开对话仍可读取。结果限制为约 24,000 字符并标记截断。

连接默认 15 秒超时，单次调用默认 60 秒，并服从整轮任务的超时和取消。外部操作发出后，超时、断连或取消不代表已经撤销；小汐提示结果未知，不自动重放业务调用。可测试连接后继续使用其他工具。

当前支持文本和结构化工具结果。OAuth、旧 SSE 传输、图片/音频/文件结果处理、交互式输入、MCP resources/prompts 浏览及 Skill 系统不在本版范围内；遇到无法处理的结果会报告错误。

## 开发验证

后端通过 LangChain 1.4.3 的 `MCPAdapter` 与 FastMCP 连接服务器，依赖由 `backend/uv.lock` 锁定。每个服务有独立连接任务和串行调用队列；停用、删除及退出时释放会话和所属子进程。MCP 运行时已纳入独立后端封装。

API 均以 `/api/v1` 为前缀并使用原有本机认证：`GET /tools`、`PATCH /tools/{id}`、`GET/POST /mcp/servers`、`PUT/DELETE /mcp/servers/{id}`、`POST /mcp/servers/{id}/test`、`POST /mcp/servers/import`。

自动测试使用临时数据库、模拟凭据、本地 stdio / HTTP MCP 和模拟模型。浏览器测试可设置 `BAI_BROWSER_URL`、`BAI_MOCK_URL`；MCP 专项另设 `BAI_MCP_QA=1`、`BAI_MCP_FIXTURE_URL`。隔离原生验证使用不同应用标识和 5294/8794/9294 端口；`BAI_FRONTEND_ORIGIN` 可明确允许一个额外的本机 HTTP 来源，不能设置为公网来源。

`scripts/verify-mcp-backend.py` 检查封装后端在系统 PATH 不含 Python/Node 时的 stdio 接入、组合调用、重启持久化和子进程回收，仅使用 `.local-data/mcp-review` 和本地模拟模型。`tests/native.mcp.verify.mjs` 仅连接上述隔离窗口。两者均不操作个人安装版。
