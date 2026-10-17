# 模型连接

设置页以连接列表管理配置。每套连接有独立名称、服务商类型、接口地址、凭据引用和模型列表，同一服务商可配置多套。添加和编辑在弹窗中完成；图片与思考参数收进模型的“能力设置”。主页面仅保留一个默认模型选择器，以“连接名称 · 模型名称”区分来源。

阿里云百炼、DeepSeek、Kimi、智谱和硅基流动提供接口与模型示例，自定义接口保留自由输入。预设仅用于新建连接，不会生成已连接状态；状态中的“已配置”表示密钥和模型字段存在，连通性需用户点击“保存并测试模型”验证。

凭据按连接 ID 保存在系统凭据管理中。旧版 `model` 凭据和单模型设置保留为原有连接；新连接使用 `model:<connection-id>`，SQLite 与读取 API 均不返回密钥。删除连接同时移除对应凭据，删除默认连接会回退到剩余连接。

聊天可选择任意已配置连接中的模型，每次发送时保存接口、模型、图片能力和思考开关的快照。重试沿用原快照；后续修改默认模型不会改变正在运行的请求。学习等其他入口使用全局默认模型。默认关闭可切换模型的思考；始终思考的模型显示不可关闭状态，未知模型不会擅自发送扩展参数，可在能力设置中指定接口协议。

`CompatibleChatModel` 保留服务商返回的 `reasoning_content`，并在流式工具调用后原样回传；同模型下一轮所需的上下文保存在消息的内部字段中，不暴露在聊天消息 API。聊天工具菜单只展示 MCP 工具开关，内置工具继续自动参与 Agent 调用。

接口与参数依据官方文档核对（2026-10-17）：

- [百炼深度思考](https://help.aliyun.com/zh/model-studio/deep-thinking)：`enable_thinking`，预设中国内地兼容接口；其他地域需自行调整地址与对应密钥。
- [DeepSeek 思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)：`thinking.type` 和工具轮次的 `reasoning_content`。
- [Kimi 思考模型](https://platform.kimi.com/docs/guide/use-thinking-models)：K2.6 可切换，K3 / K2.7 Code 始终思考。
- [智谱思考模式](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode)：`thinking.type`，GLM-5.3 系列始终思考。
- [硅基流动 Chat Completions](https://api-docs.siliconflow.cn/docs/api/chat-completions-post)：Qwen3 的 `enable_thinking`；[兼容地址](https://docs.siliconflow.cn/docs/userguide/quickstart)。

本轮使用本地协议服务验证请求参数、流式工具调用、独立凭据、持久化、迁移和界面交互；没有使用用户真实密钥调用这些服务商。安装包需等待本轮桌面测试验收后构建。

验证结果：139 项后端测试、26 项前端测试、17 项浏览器交互检查通过；TypeScript 与 Vite 构建通过。原生测试窗口视口为 1266 × 710，配置弹窗和保存按钮均在可见区域内；700 × 480 的窄矮窗口检查也通过。Vite 仍有单个 JS chunk 超过 500 kB 的构建提示，本轮未做无关拆包。
