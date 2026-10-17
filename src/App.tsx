import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  Brain,
  CircleHelp,
  Loader2,
  MessageCircle,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
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
import { ReminderPage } from "./components/ReminderPage";
import { SettingsPage, type SettingsTab } from "./components/SettingsPage";
import { ConfirmDelete, ErrorNotice } from "./components/common";
import { BaiAvatar } from "./components/BaiAvatar";
import { WindowFrame } from "./components/WindowFrame";

type Page = "chat" | "learning" | "reminders" | "settings";
const pages: { id: Page; label: string; icon: typeof Brain }[] = [
  { id: "chat", label: "对话", icon: MessageCircle },
  { id: "learning", label: "学习", icon: BookOpen },
  { id: "reminders", label: "提醒", icon: Bell },
];

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("bai-sidebar-collapsed") === "true",
  );
  const [page, setPage] = useState<Page>("chat");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connections");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [createKey, setCreateKey] = useState(0);
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [info, setInfo] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const refreshVersion = useRef(0);
  const isReminderWindow =
    new URLSearchParams(location.search).get("view") === "reminder";
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const values = await Promise.all([
      api<Settings>("/settings"),
      api<Conversation[]>("/conversations"),
      api<Goal[]>("/learning/goals"),
      api<Memory[]>("/memories"),
      api<Reminder[]>("/reminders"),
      api<Notification[]>("/notifications"),
    ]);
    // Slow earlier snapshots must not overwrite a newer tool/memory update.
    if (version !== refreshVersion.current) return;
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
    if (value === "memories" || value === "tools") {
      setPage("settings");
      setSettingsTab(value);
    } else {
      setPage(value as Page);
      if (value === "settings") setSettingsTab("connections");
    }
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
  function toggleSidebar() {
    const collapsed = !sidebarCollapsed;
    setSidebarCollapsed(collapsed);
    localStorage.setItem("bai-sidebar-collapsed", String(collapsed));
  }
  function startNewChat() {
    setConversationId(null);
    setChatKey((value) => value + 1);
    navigate("chat");
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (event.key === "F1") {
        event.preventDefault();
        setShortcuts(true);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey)
        return;
      if (key === "n") {
        event.preventDefault();
        startNewChat();
      } else if (key === ",") {
        event.preventDefault();
        navigate("settings");
      } else if (["1", "2", "3"].includes(key)) {
        event.preventDefault();
        navigate(["chat", "learning", "reminders"][Number(key) - 1]);
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  if (loading)
    return (
      <WindowFrame collapsed={sidebarCollapsed} reminder={isReminderWindow}>
        <div className="boot-screen">
          <div className="brand-icon large">
            <BaiAvatar />
          </div>
          <h1>XiaoXi</h1>
          <p>
            <Loader2 size={16} className="spin" />
            正在打开你的个人空间…
          </p>
        </div>
      </WindowFrame>
    );
  if (!settings)
    return (
      <WindowFrame collapsed={sidebarCollapsed} reminder={isReminderWindow}>
        <div className="boot-screen">
          <h1>暂时无法连接本机服务</h1>
          <ErrorNotice message={error || "请检查后端服务是否正常启动。"} />
          <Button onClick={() => void boot()}>重新连接</Button>
        </div>
      </WindowFrame>
    );
  if (isReminderWindow)
    return (
      <div className="reminder-popup">
        <div className="popup-heading">
          <Bell size={23} />
          <span>XiaoXi提醒你</span>
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
    <WindowFrame
      collapsed={sidebarCollapsed}
      sidebarAvailable={page === "chat"}
      onToggle={page === "chat" ? toggleSidebar : undefined}
      menuActions={{
        newChat: startNewChat,
        newLearning: () => navigate("learning", true),
        newReminder: () => navigate("reminders", true),
        navigate,
        about: () => setInfo(true),
        shortcuts: () => setShortcuts(true),
      }}
      onReminders={() => navigate("reminders")}
      unread={unread}
    >
      <div
        className={`app-shell ${sidebarCollapsed || page !== "chat" ? "sidebar-collapsed" : ""}`}
      >
        <aside
          id="bai-sidebar"
          className="sidebar"
          aria-label="应用导航与历史对话"
        >
          <div className="navigation-rail">
            <BaiAvatar interactive className="rail-avatar" />
            <nav className="main-navigation" aria-label="主导航">
              {pages.map((value) => (
                <button
                  className={page === value.id ? "active" : ""}
                  aria-current={page === value.id ? "page" : undefined}
                  aria-label={value.label}
                  title={value.label}
                  key={value.id}
                  onClick={() => navigate(value.id)}
                >
                  <value.icon size={20} />
                  {value.id === "reminders" && unread > 0 && (
                    <small className="nav-count">{unread}</small>
                  )}
                </button>
              ))}
            </nav>
            <div className="sidebar-footer">
              <button
                className={page === "settings" ? "active" : ""}
                aria-label="连接与设置"
                title="连接与设置"
                aria-current={page === "settings" ? "page" : undefined}
                onClick={() => navigate("settings")}
              >
                <Settings2 size={20} />
                {(memories.some((x) => x.state === "candidate") ||
                  !settings.model_configured) && <span className="setup-dot" />}
              </button>
              <button
                onClick={() => setInfo(true)}
                aria-label="关于这个空间"
                title="关于这个空间"
              >
                <CircleHelp size={19} />
              </button>
            </div>
          </div>
          <div
            className="chat-sidebar"
            id="chat-sidebar"
            hidden={sidebarCollapsed || page !== "chat"}
          >
            <div className="chat-sidebar-heading">
              <button
                className="brand-home"
                aria-label="返回对话"
                onClick={startNewChat}
              >
                <strong>XiaoXi</strong>
              </button>
            </div>
            <Button
              className="new-chat-button"
              aria-label="开启新对话"
              onClick={startNewChat}
            >
              <Plus size={16} aria-hidden="true" />
              <span>新聊天</span>
            </Button>
            <div className="conversation-sidebar">
              <p className="sidebar-label">
                最近聊天 <span>{conversations.length}</span>
              </p>
              {conversations.length ? (
                conversations.map((value) => (
                  <div
                    className={`conversation-link ${page === "chat" && conversationId === value.id ? "selected" : ""}`}
                    key={value.id}
                  >
                    <button
                      title={value.title}
                      aria-current={
                        page === "chat" && conversationId === value.id
                          ? "page"
                          : undefined
                      }
                      onClick={() => {
                        setConversationId(value.id);
                        navigate("chat");
                      }}
                    >
                      <MessageCircle size={14} />
                      <span>{value.title}</span>
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
                <p className="sidebar-empty">暂无聊天</p>
              )}
            </div>
          </div>
        </aside>
        <main className="main-panel">
          <div className="page-body">
            {page === "chat" && (
              <ChatPage
                key={chatKey}
                conversationId={conversationId}
                onConversation={setConversationId}
                settings={settings}
                goals={goals}
                reminders={reminders}
                memories={memories}
                refresh={refresh}
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
              <SettingsPage
                settings={settings}
                onSaved={setSettings}
                memories={memories}
                refresh={refresh}
                tab={settingsTab}
                onTab={setSettingsTab}
                createRequested={createKey}
              />
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
          <DialogContent className="about-dialog">
            <DialogHeader>
              <DialogTitle>你的个人空间</DialogTitle>
              <DialogDescription>
                XiaoXi · 0.1.2{import.meta.env.DEV ? " 开发版" : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="about-copy">
              <p>
                一个帮你查资料、逐步学习、记住重要信息和安排提醒的个人助手。
              </p>
              <p>
                当前数据保存在本机。关闭窗口后继续在托盘运行；退出应用或关闭电脑后，本机提醒暂停。
              </p>
              <p>
                模型与搜索接口由你配置。图片和文字反馈会说明依据，代码不会在本版本中自动执行。
              </p>
              <p>手机互联与云端持续提醒将在后续版本加入。</p>
            </div>
            <DialogFooter>
              <Button onClick={() => setInfo(false)}>知道了</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={shortcuts} onOpenChange={setShortcuts}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>快捷键</DialogTitle>
              <DialogDescription>XiaoXi</DialogDescription>
            </DialogHeader>
            <dl className="shortcut-list">
              {[
                ["新建对话", "Ctrl+N"],
                ["对话 / 学习 / 提醒", "Ctrl+1 / 2 / 3"],
                ["连接与设置", "Ctrl+,"],
                ["打开快捷键", "F1"],
                ["发送消息", "Enter"],
                ["输入框换行", "Shift+Enter"],
              ].map(([label, keys]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <kbd>{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <DialogFooter>
              <Button onClick={() => setShortcuts(false)}>知道了</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </WindowFrame>
  );
}
