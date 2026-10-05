import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Brain,
  Cable,
  Check,
  ChevronDown,
  Compass,
  Loader2,
  Search,
  Sparkles,
  Square,
  Bell,
  ExternalLink,
} from "lucide-react";
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
} from "@/lib/api";
import { ErrorNotice, ImagesInput, Markdown, Picture } from "./common";

export function ChatPage({
  conversationId,
  onConversation,
  settings,
  refresh,
  goals,
  onAction,
}: {
  conversationId: string | null;
  onConversation: (id: string) => void;
  settings: Settings;
  refresh: () => Promise<void>;
  goals: Goal[];
  onAction: (page: string, create?: boolean) => void;
}) {
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
  const controller = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
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
    [loadMessages, refresh],
  );
  useEffect(() => {
    let live = true;
    setMessages([]);
    setStream("");
    setTools([]);
    setError("");
    setRun(null);
    setBusy(false);
    if (conversationId) {
      void loadMessages(conversationId);
      api<Run[]>(`/runs?conversation_id=${conversationId}`)
        .then((values) => {
          if (!live) return;
          const active = values.find((value) =>
            ["queued", "running"].includes(value.status),
          );
          if (active) void track(active, conversationId);
          else if (values[0]?.status === "failed") {
            setRun(values[0]);
            setError(values[0].error || "之前的回答未完成");
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
  }, [conversationId, loadMessages, track]);
  useEffect(() => {
    const container = scroller.current;
    if (
      container &&
      container.scrollHeight - container.scrollTop - container.clientHeight <
        240
    )
      container.scrollTop = container.scrollHeight;
  }, [messages, stream, tools]);
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
      <div className="chat-main">
        <div
          className={`chat-scroll ${empty ? "is-empty" : ""}`}
          ref={scroller}
        >
          {empty ? (
            <div className="welcome">
              <div className="welcome-mark">
                <Sparkles size={28} />
              </div>
              <p className="eyebrow">你的思考与行动伙伴</p>
              <h1>
                从一个问题，
                <br />
                到下一步行动。
              </h1>
              <p className="welcome-description">
                想学的知识、想查的资料、想做的事情，
                <br />
                都可以从这里聊起。
              </p>
              <div className="welcome-actions">
                <button onClick={() => onAction("learning", true)}>
                  <BookOpen size={21} />
                  <span>
                    开始一段学习<small>先看框架，再逐步练习</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
                <button
                  onClick={() => {
                    setDraft("帮我查一下：");
                    composer.current?.focus();
                  }}
                >
                  <Search size={21} />
                  <span>
                    查一份资料<small>了解事实，找到可靠来源</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
                <button onClick={() => onAction("memories", true)}>
                  <Brain size={21} />
                  <span>
                    记住一件事<small>你的偏好和正在做的项目</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
                <button onClick={() => onAction("reminders", true)}>
                  <Bell size={21} />
                  <span>
                    安排一个提醒<small>为重要的事留出时间</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((value) => (
                <article className={`message ${value.role}`} key={value.id}>
                  <div className="message-avatar">
                    {value.role === "assistant" ? (
                      <Sparkles size={16} />
                    ) : (
                      <span>我</span>
                    )}
                  </div>
                  <div className="message-body">
                    <span className="message-name">
                      {value.role === "assistant" ? "Bai" : "你"}
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
                    <Sparkles size={16} />
                  </div>
                  <div className="message-body">
                    <span className="message-name">Bai</span>
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
              <button onClick={() => setExpanded(!expanded)}>
                <Check size={13} />
                {tools.length} 项工具操作
                <ChevronDown size={14} />
              </button>
              {expanded &&
                tools.map((event, i) => (
                  <div className="tool-result" key={i}>
                    <strong>{String(event.data.name)}</strong>
                    <pre>{JSON.stringify(event.data.arguments, null, 2)}</pre>
                    <pre>{JSON.stringify(event.data.result, null, 2)}</pre>
                  </div>
                ))}
            </div>
          )}
        </div>
        <div className="composer-area">
          {error && (
            <ErrorNotice
              message={error}
              retry={run?.status === "failed" ? () => void retry() : undefined}
            />
          )}
          {!settings.model_configured && (
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
              ref={composer}
              aria-label="发送给 Bai 的消息"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                settings.model_configured
                  ? "聊聊你想学的、想了解的或想做的…"
                  : "先配置模型，也可以直接添加记忆和提醒"
              }
              rows={2}
              disabled={busy}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (settings.model_configured && !busy) void send();
                }
              }}
            />
            <div className="composer-bottom">
              <ImagesInput
                images={images}
                onChange={setImages}
                disabled={busy || !settings.model_configured}
                onError={setError}
                onUploading={setUploading}
              />
              <div className="composer-submit">
                <span>Enter 发送 · Shift + Enter 换行</span>
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
                      !settings.model_configured ||
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
          <p className="composer-note">
            Bai 会保存对话和学习进度。需要核实的内容，记得查看来源。
          </p>
        </div>
      </div>
      <aside className="context-rail" aria-label="学习进度与连接状态">
        <div className="context-header">
          <Compass size={17} />
          <span>在你身边</span>
        </div>
        <div className="context-section">
          <p className="eyebrow">接着上次学</p>
          {goals.length ? (
            goals.slice(0, 3).map((goal) => (
              <button
                className="context-goal"
                key={goal.id}
                onClick={() => {
                  localStorage.setItem("bai-current-goal", goal.id);
                  onAction("learning");
                }}
              >
                <span className="topic-icon small">
                  <BookOpen size={16} />
                </span>
                <span>
                  <strong>{goal.title}</strong>
                  <small>
                    {goal.nodes.find((x) => x.id === goal.current_node_id)
                      ?.title || "等待规划课程"}
                  </small>
                </span>
                <ArrowRight size={14} />
              </button>
            ))
          ) : (
            <>
              <p className="context-empty">
                还没有学习目标。
                <br />
                从你感兴趣的一件事开始。
              </p>
              <button
                className="text-button"
                onClick={() => onAction("learning", true)}
              >
                建立学习目标
                <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
        <div className="context-section">
          <p className="eyebrow">一点点，也算进步</p>
          <div className="quote-mark">“</div>
          <p className="context-quote">
            先理解一个知识点，
            <br />
            再亲手试一试。
          </p>
          <p className="context-explanation">
            Bai 会记住你学到哪里，
            <br />
            也会留意需要回补的地方。
          </p>
        </div>
        <div className="context-connection">
          <span
            className={`status-dot ${settings.model_configured ? "online" : ""}`}
          />
          <div>
            <strong>
              {settings.model_configured ? "模型已配置" : "等待连接模型"}
            </strong>
            <small>
              {settings.model_configured
                ? settings.model_name
                : "使用自己的模型 API"}
            </small>
          </div>
          <button
            aria-label="打开连接设置"
            onClick={() => onAction("settings")}
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </aside>
    </div>
  );
}
