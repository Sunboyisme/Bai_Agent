import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BookOpen,
  Brain,
  ChevronRight,
  CircleHelp,
  Loader2,
  MessageCircle,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  api,
  type Settings,
  type Conversation,
  type Goal,
  type Memory,
  type Reminder,
  type Notification,
} from "@/lib/api";
import { ChatPage } from "./components/ChatPage";
import { LearningPage } from "./components/LearningPage";
import { MemoryPage } from "./components/MemoryPage";
import { ReminderPage } from "./components/ReminderPage";
import { SettingsPage } from "./components/SettingsPage";
import { ConfirmDelete, ErrorNotice } from "./components/common";

type Page = "chat" | "learning" | "memories" | "reminders" | "settings";
const pages: { id: Page; label: string; icon: typeof Brain }[] = [
  { id: "chat", label: "对话", icon: MessageCircle },
  { id: "learning", label: "学习", icon: BookOpen },
  { id: "memories", label: "记忆", icon: Brain },
  { id: "reminders", label: "提醒", icon: Bell },
];

export function App() {
  const [page, setPage] = useState<Page>("chat");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [createKey, setCreateKey] = useState(0);
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [info, setInfo] = useState(false);
  const isReminderWindow =
    new URLSearchParams(location.search).get("view") === "reminder";
  const refresh = useCallback(async () => {
    const values = await Promise.all([
      api<Settings>("/settings"),
      api<Conversation[]>("/conversations"),
      api<Goal[]>("/learning/goals"),
      api<Memory[]>("/memories"),
      api<Reminder[]>("/reminders"),
      api<Notification[]>("/notifications"),
    ]);
    setSettings(values[0]);
    setConversations(values[1]);
    setGoals(values[2]);
    setMemories(values[3]);
    setReminders(values[4]);
    setNotifications(values[5]);
  }, []);
  const boot = useCallback(async () => {
    setLoading(true);
    setError("");
    for (let i = 0; i < 30; i++) {
      try {
        await refresh();
        setLoading(false);
        return;
      } catch (error) {
        if (i === 29) {
          setError((error as Error).message);
          setLoading(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }, [refresh]);
  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    if (!settings) return;
    const timer = setInterval(() => {
      void api<Notification[]>("/notifications")
        .then(setNotifications)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [Boolean(settings)]);
  useEffect(() => {
    if (!isTauri()) return;
    const stop = listen("bai-reminder", () => {
      void refresh();
    });
    return () => {
      void stop.then((fn) => fn());
    };
  }, [refresh]);
  function navigate(value: string, create = false) {
    setPage(value as Page);
    if (create) setCreateKey(Date.now());
    else setCreateKey(0);
  }
  async function deleteConversation() {
    if (!deleting) return;
    try {
      await api(`/conversations/${deleting.id}`, "DELETE");
      if (conversationId === deleting.id) setConversationId(null);
      await refresh();
      setDeleting(null);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const unread = notifications.filter((x) => x.status !== "read").length;
  if (loading)
    return (
      <div className="boot-screen">
        <div className="brand-icon large">
          <Sparkles size={27} />
        </div>
        <h1>Bai</h1>
        <p>
          <Loader2 size={16} className="spin" />
          正在打开你的个人空间…
        </p>
      </div>
    );
  if (!settings)
    return (
      <div className="boot-screen">
        <h1>暂时无法连接本机服务</h1>
        <ErrorNotice message={error || "请检查后端服务是否正常启动。"} />
        <Button onClick={() => void boot()}>重新连接</Button>
      </div>
    );
  if (isReminderWindow)
    return (
      <div className="reminder-popup">
        <div className="popup-heading">
          <Bell size={23} />
          <span>Bai 提醒你</span>
        </div>
        {notifications
          .filter((x) => x.status !== "read")
          .slice(0, 3)
          .map((value) => (
            <div className="popup-item" key={value.id}>
              <h2>{value.title}</h2>
              <p>{value.body || "给这件事留一点时间。"}</p>
            </div>
          ))}
        <Button
          onClick={async () => {
            for (const value of notifications.filter(
              (x) => x.status !== "read",
            ))
              await api(`/notifications/${value.id}/ack?read=true`, "POST");
            await getCurrentWindow().close();
          }}
        >
          知道了
        </Button>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="应用导航与历史对话">
        <button className="brand" onClick={() => navigate("chat")}>
          <div className="brand-icon">
            <Sparkles size={19} />
          </div>
          <div>
            <strong>
              Bai<span>Agent</span>
            </strong>
            <small>你的个人助手</small>
          </div>
        </button>
        <Button
          className="new-chat-button"
          variant="outline"
          onClick={() => {
            setConversationId(null);
            navigate("chat");
          }}
        >
          <Plus size={16} />
          新的对话
        </Button>
        <nav className="main-navigation" aria-label="主导航">
          {pages.map((value) => (
            <button
              className={page === value.id ? "active" : ""}
              key={value.id}
              onClick={() => navigate(value.id)}
            >
              <value.icon size={19} />
              <span>{value.label}</span>
              {value.id === "reminders" && unread > 0 && (
                <small className="nav-count">{unread}</small>
              )}
              {value.id === "memories" &&
                memories.some((x) => x.state === "candidate") && (
                  <span className="candidate-dot" />
                )}
            </button>
          ))}
        </nav>
        <div className="conversation-sidebar">
          <p className="sidebar-label">最近对话</p>
          {conversations.length ? (
            conversations.slice(0, 15).map((value) => (
              <div
                className={`conversation-link ${page === "chat" && conversationId === value.id ? "selected" : ""}`}
                key={value.id}
              >
                <button
                  onClick={() => {
                    setConversationId(value.id);
                    navigate("chat");
                  }}
                >
                  {value.title}
                </button>
                <button
                  aria-label={`删除对话 ${value.title}`}
                  onClick={() => setDeleting(value)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          ) : (
            <p className="sidebar-empty">你的交流会保存在这里</p>
          )}
        </div>
        <div className="sidebar-footer">
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            <span>连接与设置</span>
            {!settings.model_configured && <span className="setup-dot" />}
          </button>
          <button onClick={() => setInfo(true)}>
            <CircleHelp size={17} />
            <span>关于这个空间</span>
          </button>
          <div className="profile">
            <div>白</div>
            <span>
              <strong>我的空间</strong>
              <small>本机保存 · 私人使用</small>
            </span>
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="app-topbar">
          <div>
            <span>我的空间</span>
            <ChevronRight size={13} />
            <strong>
              {page === "settings"
                ? "连接与设置"
                : pages.find((x) => x.id === page)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="local-indicator">
              <i />
              {settings.model_name === "mock-test"
                ? "隔离测试 · 模拟接口"
                : "本机空间"}
            </span>
            <button
              className="bell-button"
              aria-label="查看提醒"
              onClick={() => navigate("reminders")}
            >
              <Bell size={18} />
              {unread > 0 && <span />}
            </button>
          </div>
        </header>
        <div className="page-body">
          {page === "chat" && (
            <ChatPage
              conversationId={conversationId}
              onConversation={setConversationId}
              settings={settings}
              refresh={refresh}
              goals={goals}
              onAction={navigate}
            />
          )}{" "}
          {page === "learning" && (
            <LearningPage
              key={`learning-${createKey}`}
              goals={goals}
              refresh={refresh}
              onSettings={() => navigate("settings")}
              createRequested={createKey}
            />
          )}{" "}
          {page === "memories" && (
            <MemoryPage
              key={`memories-${createKey}`}
              memories={memories}
              refresh={refresh}
              createRequested={createKey}
            />
          )}{" "}
          {page === "reminders" && (
            <ReminderPage
              key={`reminders-${createKey}`}
              reminders={reminders}
              notifications={notifications}
              refresh={refresh}
              createRequested={createKey}
            />
          )}{" "}
          {page === "settings" && (
            <SettingsPage settings={settings} onSaved={setSettings} />
          )}
        </div>
      </main>
      <ConfirmDelete
        open={Boolean(deleting)}
        title="删除这段对话？"
        description="删除对话不会删除已经保存的记忆、课程或提醒。"
        label="删除对话"
        error={error}
        onClose={() => setDeleting(null)}
        onConfirm={deleteConversation}
      />
      <Dialog open={info} onOpenChange={setInfo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>你的个人空间</DialogTitle>
            <DialogDescription>Bai Agent · 0.1.0 开发版</DialogDescription>
          </DialogHeader>
          <div className="about-copy">
            <p>一个帮你查资料、逐步学习、记住重要信息和安排提醒的个人助手。</p>
            <p>
              当前数据保存在本机。关闭窗口后继续在托盘运行；退出应用或关闭电脑后，本机提醒暂停。
            </p>
            <p>
              模型与搜索接口由你配置。图片和文字反馈会说明依据，代码不会在本版本中自动执行。
            </p>
            <p>手机互联与云端持续提醒将在后续版本加入。</p>
          </div>
          <DialogFooter>
            {isTauri() && (
              <Button variant="outline" onClick={() => void invoke("quit_app")}>
                退出 Bai
              </Button>
            )}
            <Button onClick={() => setInfo(false)}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
