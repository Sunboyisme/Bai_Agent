# Bai Agent · 0.1.0 开发版

个人助手，支持查资料、按知识框架逐步学习、保存记忆和安排提醒。当前交付是 **Windows 桌面开发版**。学习可以围绕前端开发、做饭、养猫、游戏等主题展开，内容由你配置的模型生成。

项目位置：`C:\QinBai\草稿\Bai-Agent`。开发路线见 [PLAN.md](PLAN.md)，技术说明见 [docs/architecture.md](docs/architecture.md)。

## 启动

本机依赖已经安装。双击项目根目录的 **`启动Bai-Agent.cmd`**。启动器在后台运行开发服务，第一次编译或依赖变化后需要等待；再次启动会打开已有窗口。

也可以在 PowerShell 中运行：

```powershell
Set-Location -LiteralPath 'C:\QinBai\草稿\Bai-Agent'
pnpm desktop:dev
```

桌面程序自动启动 Python 后端。正常启动桌面时不需要再手动执行 `backend:dev`。关闭主窗口后留在托盘运行；双击托盘图标打开窗口，通过托盘菜单或「关于这个空间 → 退出 Bai」彻底退出。

启动器依赖 PowerShell 7、Node.js/pnpm、Python 3.12/uv、Rust 和 Windows WebView2/MSVC 构建环境。新机器先准备这些环境，再运行：

```powershell
pnpm install --frozen-lockfile
uv sync --project backend --frozen
pnpm desktop:dev
```

启动日志位于 `.local-data\dev\desktop.log`。当前可执行文件仍依赖本项目、Python 虚拟环境和前端开发服务，不能单独复制给别人当作安装版。

## 第一次使用

1. 打开「连接与设置」，填写服务商的 **OpenAI 兼容接口地址、模型名称、API 密钥**。接口地址一般包含 `/v1`，以服务商说明为准。模型需要支持 Chat Completions 和工具调用。点击「保存并测试模型」会发起一次真实模型请求。
2. 需要提交图片时，确认模型支持图片，再勾选图片输入。不要仅依据模型名称推测是否支持。
3. 需要联网查资料时，另外填写 **Tavily API 密钥**。模型密钥与搜索密钥是两个不同配置。没有搜索密钥时，Bai 会报告联网不可用。
4. 在对话中说「我想系统学习前端，从零开始，目标是做一个个人网站」，或打开「学习 → 新的学习目标」，填写主题、目标和基础。

学习会保存模块、前置关系、知识点和练习标准。选择一个知识点后，获得讲解、示例与练习；用文字、代码片段或图片提交，模型给出有依据的反馈。练习未通过可以补讲并重练；跳过会标记「尚未验证」。学习进度与练习等待状态在重启后恢复。通过练习后，可以主动安排次日复习提醒。

在对话中明确说「请记住……」，或在「记忆」页手动保存。自动归纳的候选记忆需要确认，才会进入个人背景。你可以编辑或删除；历史对话单独保留。

提醒支持一次、每天、每周，也可完成、取消或延后。界面使用**北京时间**。电脑开机且 Bai 在托盘运行时，提醒可以通过独立窗口显示，同时尝试发送 Windows 通知。应用退出、电脑关机或休眠时不能按时弹出；恢复运行后补充一次逾期提示，重复事项跳到下一次时间，不逐条轰炸历史遗漏。

## 数据与密钥

- 正常开发空间：`.local-data\dev`。SQLite 保存对话、课程、练习、记忆、提醒和执行记录；`checkpoints.sqlite` 保存 LangGraph 状态，图片保存在 `attachments`。
- API 密钥通过 `keyring` 写入 Windows 凭据存储，不写进数据库、前端代码或 Git。接口地址不能内嵌用户名和密码。留空密钥表示保留已有配置，勾选清除才删除。
- 本机 API 仅监听 `127.0.0.1:8766`，前端开发服务使用 `127.0.0.1:5186`。不要把当前版本的服务直接暴露到公网。
- `.local-data\review` 是开发验证数据，连接本地模拟接口时会显示「隔离测试 · 模拟接口」。正常空间没有内置模拟回复，也不会自动调用任何外部模型。
- 备份前退出应用，再复制整个数据目录。密钥存储单独管理，复制数据库不会复制密钥。

## 当前边界

当前尚未实现云端账号、跨设备同步、iPhone 客户端、手机推送、关机后的持续提醒、安装包及 App Store 上架。下一阶段按 PLAN.md 接入云端，然后做 iPhone 客户端。

文字与图片反馈属于模型分析，本版本不自动运行用户代码，也不现场验证操作结果。联网搜索返回链接和摘要，读取正文失败时工具明确报告失败。真实教学质量、来源选择和特定服务商兼容性需要接入你的模型后评估。

## 开发与验证

```powershell
# 后端自动测试：自动使用独立的临时目录，不打开个人数据库
uv run --project backend pytest backend/tests -q
# SSE 解码与错误呈现测试
pnpm test
# 生成 API 类型、检查类型并构建前端
pnpm api:types
pnpm build
# Rust 检查，不打包
cargo check --manifest-path src-tauri/Cargo.toml
```

浏览器端到端测试使用本地模拟模型。先退出桌面应用，再分别在三个终端启动下列服务，每个终端设置相同的 `BAI_DATA_DIR`：

```powershell
# 终端一：隔离的后端
$env:BAI_DATA_DIR = 'C:\QinBai\草稿\Bai-Agent\.local-data\review'
$env:BAI_MODEL_API_KEY = 'synthetic-key'
uv run --project backend uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8766 --no-access-log
# 终端二：前端（也设置上面的 BAI_DATA_DIR）
pnpm dev
# 终端三：本地协议测试服务
uv run --project backend python backend/tests/mock_provider.py
```

然后运行 `pnpm exec playwright test`，使用本机 Chrome。测试会在隔离空间创建测试对话和课程，不产生真实模型费用。**不要对正常个人空间运行这些浏览器测试。** Windows 原生验证另用 `tests/native.verify.mjs`，需要桌面开发进程开启 CDP 9227，并已有浏览器测试保存的前端课程。

已验证的结果与未验证事项见 [docs/verification.md](docs/verification.md)。
