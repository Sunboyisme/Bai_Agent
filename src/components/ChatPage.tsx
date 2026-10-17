import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ArrowUp,
  Cable,
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Layers2,
  Settings2,
  Square,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  api,
  readEvents,
  type Conversation,
  type Message,
  type Run,
  type RunEvent,
  type Settings,
  type Attachment,
  type Goal,
  type Reminder,
  type Memory,
} from "@/lib/api";
import { ErrorNotice, ImagesInput, Markdown, Picture } from "./common";
import { ToolboxMenu } from "./ToolboxMenu";
import { BaiAvatar } from "./BaiAvatar";
import {
  MemoryReview,
  MemorySavedNotice,
  type MemoryNotice,
} from "./MemoryFeedback";

function toolSummary(event: RunEvent): string {
  const result = event.data.result as Record<string, unknown> | undefined;
  if (!result) return "操作已完成";
  if (result.error) return String(result.error);
  if (result.summary) return String(result.summary).slice(0, 220);
  if (result.text) return String(result.text).slice(0, 220);
  if (result.structured_content)
    return JSON.stringify(result.structured_content).slice(0, 220);
  if (result.skipped) return String(result.skipped);
  if (result.needs_clarification) return "找到多个同名地点，等待确认";
  if (result.result !== undefined)
    return `结果：${String(result.result)}${result.to_unit ? ` ${result.to_unit}` : ""}`;
  if (result.datetime) return `${result.datetime} · ${result.weekday}`;
  if (result.current) {
    const current = result.current as Record<string, unknown>;
    const location = result.location as Record<string, unknown>;
    return `${location.name} · ${current.condition} · ${current.temperature_c}°C`;
  }
  if (Array.isArray(result.results))
    return `找到 ${result.results.length} 条来源，详见回答中的链接`;
  if (result.count !== undefined) return `找到 ${result.count} 条记录`;
  if (result.read) return "已读取网页正文";
  if (result.state === "candidate") return "已保存为候选记忆，等待确认";
  if (result.state === "confirmed") return "记忆已保存";
  if (result.title) return String(result.title);
  return "操作已完成";
}

function resizeMessageInput(input: HTMLTextAreaElement) {
  const scrollTop = input.scrollTop;
  input.style.height = "auto";
  const maxHeight = Number.parseFloat(getComputedStyle(input).maxHeight) || 180;
  if (!input.scrollHeight) return;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  if (
    document.activeElement === input &&
    input.selectionEnd === input.value.length
  ) {
    input.scrollTop = input.scrollHeight;
  } else {
    input.scrollTop = scrollTop;
  }
}

export function ChatPage({
  conversationId,
  onConversation,
  settings,
  memories,
  refresh,
  onAction,
}: {
  conversationId: string | null;
  onConversation: (id: string) => void;
  settings: Settings;
  goals: Goal[];
  reminders: Reminder[];
  memories?: Memory[];
  refresh: () => Promise<void>;
  onAction: (page: string, create?: boolean) => void;
}) {
  const [modelKey, setModelKey] = useState("");
  const [thinking, setThinking] = useState(false);
  const choices = settings.providers.flatMap((profile) =>
    profile.models.map((model) => ({
      profile,
      model,
      key: `${profile.id}:${model.name}`,
    })),
  );
  const selected =
    choices.find((x) => x.key === modelKey) ||
    choices.find(
      (x) =>
        x.profile.id === settings.default_provider &&
        x.model.name === x.profile.default_model,
    );
  const modelReady = Boolean(selected?.profile.key_configured);
  const thinkingControl = selected?.model.thinking_control || "none";
  const thinkingEnabled =
    thinkingControl === "always" || (thinkingControl !== "none" && thinking);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<Attachment[]>([]);
  const [stream, setStream] = useState("");
  const [tools, setTools] = useState<RunEvent[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState<MemoryNotice | null>(null);
  const closeMemoryNotice = useCallback(() => setMemoryNotice(null), []);
  const receiveMemory = useCallback((event: RunEvent) => {
    const { change_id, state, content, action } = event.data;
    if (state !== "confirmed" || typeof change_id !== "string") return;
    const key = `bai-memory-notice:${change_id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "seen");
    setMemoryNotice({
      change_id,
      content: String(content || ""),
      action: String(action),
    });
  }, []);
  const controller = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (composer.current) resizeMessageInput(composer.current);
  }, [draft]);
  useEffect(() => {
    const input = composer.current;
    if (!input || typeof ResizeObserver === "undefined") return;
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resizeMessageInput(input);
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, []);
  const currentId = useRef(conversationId);
  currentId.current = conversationId;
  const loadMessages = useCallback(async (id: string) => {
    const values = await api<Message[]>(`/conversations/${id}/messages`);
    if (currentId.current === id) setMessages(values);
  }, []);
  const track = useCallback(
    async (value: Run, id: string) => {
      controller.current?.abort();
      const watch = new AbortController();
      controller.current = watch;
      setRun(value);
      setBusy(true);
      setStream("");
      setTools([]);
      try {
        const result = await readEvents(
          value.id,
          (event) => {
            if (watch.signal.aborted) return;
            if (event.kind === "delta")
              setStream((text) => text + String(event.data.text || ""));
            if (event.kind === "tool") setTools((values) => [...values, event]);
            if (event.kind === "memory") {
              receiveMemory(event);
              void refresh().catch(() => {});
            }
          },
          watch.signal,
        );
        if (watch.signal.aborted) return;
        setRun(result);
        if (result.status === "failed")
          setError(result.error || "本次回答未完成");
        if (result.status === "cancelled")
          setError("本次生成已停止；已执行的工具操作可在对应页面查看。");
        await loadMessages(id);
        await refresh();
        setStream("");
        setBusy(false);
      } catch (error) {
        if (!watch.signal.aborted) {
          setError((error as Error).message);
          setBusy(false);
        }
      }
    },
    [loadMessages, refresh, receiveMemory],
  );
  useEffect(() => {
    let live = true;
    setMessages([]);
    setStream("");
    setTools([]);
    setMemoryNotice(null);
    setError("");
    setRun(null);
    setBusy(false);
    followLatest.current = true;
    if (conversationId) {
      const initialMessages = loadMessages(conversationId);
      void initialMessages.catch((error: Error) => {
        if (live) setError(error.message);
      });
      api<Run[]>(`/runs?conversation_id=${conversationId}`)
        .then(async (values) => {
          // Finish the initial snapshot before a later reload can replace it.
          await initialMessages;
          if (!live) return;
          const active = values.find((value) =>
            ["queued", "running"].includes(value.status),
          );
          if (active) void track(active, conversationId);
          else if (values[0]) {
            // A fast run can finish between the first message load and this request.
            // Restore the persisted answer and tool results, including fast runs.
            await loadMessages(conversationId);
            if (!live) return;
            const history = await api<RunEvent[]>(
              `/runs/${values[0].id}/tools`,
            );
            if (!live) return;
            setTools(history.filter((event) => event.kind === "tool"));
            if (Date.now() - Date.parse(values[0].created_at) < 60000) {
              history
                .filter((event) => event.kind === "memory")
                .forEach(receiveMemory);
            }
            await refresh();
            if (!live) return;
            setRun(values[0]);
            if (values[0].status === "failed")
              setError(values[0].error || "之前的回答未完成");
            if (values[0].status === "cancelled")
              setError("本次生成已停止；已执行的工具操作可在对应页面查看。");
          }
        })
        .catch((error) => {
          if (live) setError(error.message);
        });
    }
    return () => {
      live = false;
      controller.current?.abort();
    };
  }, [conversationId, loadMessages, refresh, track, receiveMemory]);
  const candidates =
    memories?.filter(
      (value) =>
        value.state === "candidate" &&
        value.source_conversation_id === conversationId,
    ) || [];
  const candidateIds = candidates.map((value) => value.id).join(",");
  useEffect(() => {
    const container = scroller.current;
    if (container && followLatest.current)
      container.scrollTop = container.scrollHeight;
  }, [messages, stream, tools, candidateIds]);
  async function send() {
    if (busy || uploading || (!draft.trim() && !images.length)) return;
    setError("");
    setBusy(true);
    try {
      let id = conversationId;
      const created = !id;
      if (!id) {
        const value = await api<Conversation>("/conversations", "POST", {
          title: "新对话",
        });
        id = value.id;
      }
      const value = await api<Run>(`/conversations/${id}/messages`, "POST", {
        content: draft.trim() || "请根据这张图片帮助我分析。",
        attachment_ids: images.map((x) => x.id),
        model_selection: selected
          ? {
              provider_id: selected.profile.id,
              model_name: selected.model.name,
              thinking_enabled: thinkingEnabled,
            }
          : undefined,
      });
      setDraft("");
      setImages([]);
      await refresh();
      if (created) {
        // The conversation effect owns resuming a new conversation's run.
        onConversation(id);
      } else if (currentId.current === id) {
        await loadMessages(id);
        void track(value, id);
      }
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  async function retry() {
    if (!conversationId) return;
    setError("");
    try {
      void track(
        await api<Run>(`/conversations/${conversationId}/retry`, "POST"),
        conversationId,
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const empty = !messages.length && !busy;
  return (
    <div className="chat-layout">
      <div className={`chat-main ${empty ? "is-empty" : ""}`}>
        <div
          className={`chat-scroll ${empty ? "is-empty" : ""}`}
          ref={scroller}
          onScroll={(event) => {
            const element = event.currentTarget;
            followLatest.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              240;
          }}
        >
          {empty ? (
            <div className="welcome">
              <div className="welcome-buddy">
                <BaiAvatar interactive className="welcome-avatar" />
                <span className="welcome-greeting">嗨，我在呢</span>
              </div>
              <div>
                <p className="welcome-date">
                  {new Intl.DateTimeFormat("zh-CN", {
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                    timeZone: "Asia/Shanghai",
                  }).format(new Date())}
                </p>
                <h1>今天想做点什么？</h1>
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((value) => (
                <article className={`message ${value.role}`} key={value.id}>
                  <div className="message-avatar">
                    {value.role === "assistant" ? (
                      <BaiAvatar motion="still" />
                    ) : (
                      <span>我</span>
                    )}
                  </div>
                  <div className="message-body">
                    <span className="message-name">
                      {value.role === "assistant" ? "XiaoXi" : "你"}
                    </span>
                    <Markdown>{value.content}</Markdown>
                    {value.attachment_ids.length > 0 && (
                      <div className="message-pictures">
                        {value.attachment_ids.map((id) => (
                          <Picture id={id} key={id} />
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {busy && (
                <article className="message assistant">
                  <div className="message-avatar">
                    <BaiAvatar motion="thinking" />
                  </div>
                  <div className="message-body">
                    <span className="message-name">XiaoXi</span>
                    {stream ? (
                      <Markdown>{stream}</Markdown>
                    ) : (
                      <div className="thinking">
                        <span />
                        <span />
                        <span />
                        <span>
                          {tools.length ? "正在整理工具结果" : "正在思考"}
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              )}
            </div>
          )}
          {tools.length > 0 && (
            <div className="tool-results">
              <button
                className="tool-results-toggle"
                aria-expanded={expanded}
                aria-controls="tool-record-list"
                onClick={() => setExpanded(!expanded)}
              >
                <span className="tool-record-icon">
                  <Layers2 size={17} />
                </span>
                <span className="tool-record-heading">
                  <strong>已调用 {tools.length} 项工具</strong>
                  <small>{expanded ? "执行结果" : "展开查看执行结果"}</small>
                </span>
                <ChevronDown className="tool-record-chevron" size={16} />
              </button>
              {expanded && (
                <div id="tool-record-list" className="tool-record-list">
                  {tools.map((event, i) => {
                    const result = event.data.result as
                      Record<string, unknown> | undefined;
                    const failed =
                      event.data.status === "error" || Boolean(result?.error);
                    const needsConfirmation = Boolean(
                      result?.needs_clarification,
                    );
                    return (
                      <div
                        className={`tool-result ${failed ? "tool-result-failed" : ""}`}
                        key={i}
                      >
                        <span className="tool-result-symbol">
                          {failed || needsConfirmation ? (
                            <CircleAlert size={16} />
                          ) : (
                            <Check size={16} />
                          )}
                        </span>
                        <div className="tool-result-copy">
                          <div className="tool-result-title">
                            <strong>{String(event.data.name)}</strong>
                            {event.data.source === "mcp" && (
                              <small>{String(event.data.source_label)}</small>
                            )}
                            {typeof event.data.duration_ms === "number" && (
                              <small>
                                {(event.data.duration_ms / 1000).toFixed(1)}s
                              </small>
                            )}
                            <span className="tool-result-state">
                              {event.data.status === "cancelled"
                                ? "已取消"
                                : failed
                                  ? "调用失败"
                                  : needsConfirmation
                                    ? "待确认"
                                    : "已返回"}
                            </span>
                          </div>
                          <p>{toolSummary(event)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {candidates.length > 0 && (
            <section className="chat-memory-reviews" aria-label="记忆确认">
              {candidates.map((memory) => (
                <MemoryReview
                  key={memory.id}
                  memory={memory}
                  refresh={refresh}
                />
              ))}
            </section>
          )}
        </div>
        <div className="composer-area">
          {memoryNotice && (
            <MemorySavedNotice
              key={memoryNotice.change_id}
              notice={memoryNotice}
              refresh={refresh}
              onClose={closeMemoryNotice}
            />
          )}
          {error && (
            <ErrorNotice
              message={error}
              retry={run?.status === "failed" ? () => void retry() : undefined}
            />
          )}
          {!modelReady && (
            <button
              className="setup-nudge"
              onClick={() => onAction("settings")}
            >
              <Cable size={16} />
              <span>先连接你的模型，就能开始对话和学习。</span>
              <ArrowRight size={15} />
            </button>
          )}
          <div className="composer">
            <Textarea
              id="chat-message"
              ref={composer}
              aria-label="发送给XiaoXi的消息"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={modelReady ? "输入消息…" : "连接模型后开始对话"}
              rows={2}
              disabled={busy}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (modelReady && !busy) void send();
                }
              }}
            />
            <div className="composer-bottom">
              <div className="composer-tools">
                <ImagesInput
                  images={images}
                  onChange={setImages}
                  disabled={busy || !modelReady}
                  onError={setError}
                  onUploading={setUploading}
                />
                <ToolboxMenu onSettings={() => onAction("tools")} />
                <button
                  className="composer-thinking"
                  aria-label="思考模式"
                  aria-pressed={thinkingEnabled}
                  disabled={
                    busy ||
                    thinkingControl === "none" ||
                    thinkingControl === "always"
                  }
                  title={
                    thinkingControl === "none"
                      ? "此模型未配置思考开关"
                      : thinkingControl === "always"
                        ? "此模型始终开启思考"
                        : thinkingEnabled
                          ? "关闭思考模式"
                          : "开启思考模式"
                  }
                  onClick={() => setThinking(!thinking)}
                >
                  <Brain size={15} />
                  <span>
                    {thinkingControl === "always" ? "始终思考" : "思考"}
                  </span>
                </button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      className="composer-model"
                      aria-label="选择模型"
                      disabled={busy}
                      title={selected?.model.name || "配置模型"}
                    >
                      <span>{selected?.model.name || "选择模型"}</span>
                      <ChevronDown size={13} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="model-menu"
                      align="start"
                      sideOffset={8}
                      collisionPadding={16}
                    >
                      <DropdownMenu.Label className="model-menu-label">
                        模型
                      </DropdownMenu.Label>
                      {choices
                        .filter((x) => x.profile.key_configured)
                        .map((choice) => (
                          <DropdownMenu.Item
                            key={choice.key}
                            className="model-menu-item model-choice"
                            onSelect={() => {
                              setModelKey(choice.key);
                              setThinking(false);
                            }}
                          >
                            <span>
                              <strong>{choice.model.name}</strong>
                              <small>
                                {choice.profile.label}
                                {choice.profile.id ===
                                  settings.default_provider &&
                                choice.model.name ===
                                  choice.profile.default_model
                                  ? " · 默认"
                                  : ""}
                              </small>
                            </span>
                            {selected?.key === choice.key && (
                              <Check size={15} />
                            )}
                          </DropdownMenu.Item>
                        ))}
                      {!choices.some((x) => x.profile.key_configured) && (
                        <div className="model-menu-current">尚未连接模型</div>
                      )}
                      <DropdownMenu.Separator className="model-menu-separator" />
                      <DropdownMenu.Item
                        className="model-menu-item"
                        onSelect={() => onAction("settings")}
                      >
                        <Settings2 size={15} />
                        连接与设置
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
              <div className="composer-submit">
                {busy ? (
                  <Button
                    aria-label="停止生成"
                    size="icon"
                    onClick={() => {
                      if (run) void api(`/runs/${run.id}/cancel`, "POST");
                    }}
                  >
                    <Square size={15} />
                  </Button>
                ) : (
                  <Button
                    aria-label="发送消息"
                    size="icon"
                    disabled={
                      uploading ||
                      !modelReady ||
                      (!draft.trim() && !images.length)
                    }
                    onClick={() => void send()}
                  >
                    <ArrowUp size={19} />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
