import { SoftSelect } from "./ui/soft-select";
import { useState } from "react";
import { Bell, Check, Clock3, Pencil, Plus, Repeat2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api, type Reminder, type Notification } from "@/lib/api";
import { dateTime, localDateTime } from "@/lib/utils";
import { EmptyState, ErrorNotice, reminderStatus } from "./common";

export function ReminderPage({
  reminders,
  notifications,
  refresh,
  createRequested,
}: {
  reminders: Reminder[];
  notifications: Notification[];
  refresh: () => Promise<void>;
  createRequested?: number;
}) {
  const [open, setOpen] = useState(Boolean(createRequested));
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState(
    localDateTime(new Date(Date.now() + 3600000).toISOString()),
  );
  const [repeat, setRepeat] = useState("none");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  function edit(value?: Reminder) {
    setEditing(value || null);
    setTitle(value?.title || "");
    setBody(value?.body || "");
    setDue(
      localDateTime(
        value?.due_at || new Date(Date.now() + 3600000).toISOString(),
      ),
    );
    setRepeat(value?.recurrence || "none");
    setOpen(true);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(
        editing ? `/reminders/${editing.id}` : "/reminders",
        editing ? "PUT" : "POST",
        {
          title,
          body,
          due_at: new Date(`${due}:00+08:00`).toISOString(),
          timezone: "Asia/Shanghai",
          recurrence: repeat,
        },
      );
      await refresh();
      setOpen(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(id: string, value: string) {
    try {
      await api(`/reminders/${id}/action`, "POST", {
        action: value,
        minutes: 10,
      });
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const active = reminders.filter((x) =>
    ["active", "fired"].includes(x.status),
  );
  const values = showHistory ? reminders : active;
  const unread = notifications.filter((x) => x.status !== "read");
  async function markRead(value: Notification) {
    try {
      await api(`/notifications/${value.id}/ack?read=true`, "POST");
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>提醒</h1>
        </div>
        <Button onClick={() => edit()}>
          <Plus size={16} />
          新建提醒
        </Button>
      </div>
      {error && <ErrorNotice message={error} />}
      {unread.length > 0 && (
        <section className="notification-list">
          <div className="section-heading">
            <h2>到时间了</h2>
            <span>{unread.length} 条未读</span>
          </div>
          {unread.map((value) => (
            <div className="notification-row" key={value.id}>
              <div className="notification-symbol">
                <Bell size={18} />
              </div>
              <div>
                <strong>{value.title}</strong>
                <p>
                  {value.overdue ? "重新启动后补充的提醒 · " : ""}
                  {dateTime(value.occurrence_at)}
                  {value.body ? ` · ${value.body}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void markRead(value)}
              >
                知道了
              </Button>
            </div>
          ))}
        </section>
      )}
      <div className="list-toolbar">
        <div className="segmented">
          <button
            className={!showHistory ? "selected" : ""}
            aria-pressed={!showHistory}
            onClick={() => setShowHistory(false)}
          >
            当前事项 <span>{active.length}</span>
          </button>
          <button
            className={showHistory ? "selected" : ""}
            aria-pressed={showHistory}
            onClick={() => setShowHistory(true)}
          >
            全部记录
          </button>
        </div>
      </div>
      {values.length ? (
        <div className="reminder-list">
          {values.map((value) => (
            <article
              className={`reminder-row ${value.status === "completed" ? "completed" : ""}`}
              key={value.id}
            >
              <button
                className="complete-circle"
                aria-label={`完成 ${value.title}`}
                disabled={["completed", "cancelled"].includes(value.status)}
                onClick={() => void action(value.id, "complete")}
              >
                {value.status === "completed" && <Check size={13} />}
              </button>
              <div className="reminder-detail">
                <h3>{value.title}</h3>
                {value.body && <p>{value.body}</p>}
                <div>
                  <span
                    className={
                      value.status === "active" &&
                      new Date(value.due_at).getTime() < Date.now()
                        ? "overdue-text"
                        : ""
                    }
                  >
                    {dateTime(value.due_at)}
                  </span>
                  {value.recurrence !== "none" && (
                    <span>
                      <Repeat2 size={12} />
                      {value.recurrence === "daily" ? "每天" : "每周"}
                    </span>
                  )}
                  <span className={`status-label ${value.status}`}>
                    {reminderStatus[value.status]}
                  </span>
                </div>
              </div>
              {["active", "fired"].includes(value.status) && (
                <div className="row-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void action(value.id, "snooze")}
                  >
                    <Clock3 size={14} />
                    稍后 10 分钟
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`编辑 ${value.title}`}
                    onClick={() => edit(value)}
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`取消 ${value.title}`}
                    onClick={() => void action(value.id, "cancel")}
                  >
                    <X size={15} />
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="把下一件重要的事安排好"
          action={
            <Button variant="outline" onClick={() => edit()}>
              <Plus size={15} />
              添加一个提醒
            </Button>
          }
        >
          练习、复习、约定，或只是提醒自己好好休息。
        </EmptyState>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑提醒" : "新建提醒"}</DialogTitle>
            <DialogDescription>
              保存具体的事项和时间，到点后XiaoXi会提醒你。
            </DialogDescription>
          </DialogHeader>
          {error && <ErrorNotice message={error} />}
          <div className="form-field">
            <Label htmlFor="reminder-title">提醒我做什么</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：练习今天学的知识点"
            />
          </div>
          <div className="form-row">
            <div className="form-field">
              <Label htmlFor="reminder-time">时间（北京时间）</Label>
              <Input
                id="reminder-time"
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <div className="form-field">
              <Label htmlFor="reminder-repeat">重复</Label>
              <SoftSelect
                id="reminder-repeat"
                label="重复"
                value={repeat}
                onValueChange={setRepeat}
                options={[
                  { value: "none", label: "仅这一次" },
                  { value: "daily", label: "每天" },
                  { value: "weekly", label: "每周" },
                ]}
              />
            </div>
          </div>
          <div className="form-field">
            <Label htmlFor="reminder-body">
              补充说明 <span className="muted">选填</span>
            </Label>
            <Textarea
              id="reminder-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!title.trim() || !due || busy}
              onClick={() => void save()}
            >
              {busy ? "正在保存…" : "保存提醒"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
