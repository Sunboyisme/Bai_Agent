import { useState } from "react";
import { Brain, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { api, type Memory, type Settings } from "@/lib/api";
import { ConfirmDelete, EmptyState, ErrorNotice } from "./common";
import { MemoryReview, MemorySource } from "./MemoryFeedback";

const categories: Record<string, string> = {
  fact: "个人事实",
  preference: "偏好",
  project: "项目状态",
};
export function MemoryPage({
  memories,
  memoryMode,
  refresh,
  createRequested,
}: {
  memories: Memory[];
  memoryMode: Settings["memory_mode"];
  refresh: () => Promise<void>;
  createRequested?: number;
}) {
  const [open, setOpen] = useState(Boolean(createRequested));
  const [editing, setEditing] = useState<Memory | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("fact");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Memory | null>(null);
  const [changingMode, setChangingMode] = useState(false);
  async function changeMode(mode: Settings["memory_mode"]) {
    setChangingMode(true);
    setError("");
    try {
      await api("/settings/memory", "PATCH", { memory_mode: mode });
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setChangingMode(false);
    }
  }
  function edit(value?: Memory) {
    setEditing(value || null);
    setContent(value?.content || "");
    setCategory(value?.category || "fact");
    setOpen(true);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(
        editing ? `/memories/${editing.id}` : "/memories",
        editing ? "PUT" : "POST",
        {
          content,
          category,
          source: editing?.source || "用户手动记录",
          state: "confirmed",
          revision: editing?.revision,
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
  async function remove() {
    if (!deleting) return;
    try {
      await api(`/memories/${deleting.id}`, "DELETE");
      await refresh();
      setDeleting(null);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const candidates = memories.filter(
    (x) => x.state === "candidate" && x.content.includes(query),
  );
  const values = memories.filter(
    (x) => x.state === "confirmed" && x.content.includes(query),
  );
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <h1>记忆</h1>
          <p>查看、修改或删除 Bai 记住的信息。</p>
        </div>
        <div className="memory-heading-actions">
          <select
            className="native-select"
            aria-label="记忆保存方式"
            value={memoryMode}
            disabled={changingMode}
            onChange={(event) =>
              void changeMode(event.target.value as Settings["memory_mode"])
            }
          >
            <option value="auto">自动记忆</option>
            <option value="confirm">每次确认</option>
          </select>
          <Button onClick={() => edit()}>
            <Plus size={16} />
            添加记忆
          </Button>
        </div>
      </div>
      {error && <ErrorNotice message={error} />}
      {candidates.length > 0 && (
        <section className="candidate-section">
          <h2>
            等待你确认 <span>{candidates.length}</span>
          </h2>
          {candidates.map((value) => (
            <MemoryReview key={value.id} memory={value} refresh={refresh} />
          ))}
        </section>
      )}
      {memories.length > 0 && (
        <div className="search-field">
          <Search size={17} />
          <Input
            aria-label="搜索记忆"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索记忆…"
          />
        </div>
      )}
      {values.length ? (
        <div className="memory-grid">
          {values.map((value) => (
            <article className="memory-card" key={value.id}>
              <div className="memory-card-top">
                <span className="small-label">
                  {categories[value.category]}
                </span>
                <div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="编辑记忆"
                    onClick={() => edit(value)}
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="删除记忆"
                    onClick={() => setDeleting(value)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
              <p>{value.content}</p>
              <MemorySource memory={value} />
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Brain}
          title={query ? "没有匹配的记忆" : "从一件你想让 Bai 记住的事开始"}
          action={
            !query && (
              <Button variant="outline" onClick={() => edit()}>
                <Plus size={15} />
                记录第一条记忆
              </Button>
            )
          }
        >
          {query
            ? "换一个关键词试试。"
            : "你的偏好、正在做的项目、最近的目标，都可以放在这里。"}
        </EmptyState>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑记忆" : "添加记忆"}</DialogTitle>
            <DialogDescription>
              保存具体、准确的信息，之后的交流会参考这些内容。
            </DialogDescription>
          </DialogHeader>
          {error && <ErrorNotice message={error} />}
          <div className="form-field">
            <Label htmlFor="memory-content">想记住什么</Label>
            <Textarea
              id="memory-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="例如：我喜欢先了解总体框架，再通过练习逐步学习。"
              rows={5}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="memory-category">类型</Label>
            <select
              id="memory-category"
              className="native-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.entries(categories).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!content.trim() || busy}
              onClick={() => void save()}
            >
              {busy ? "正在保存…" : "保存记忆"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDelete
        open={Boolean(deleting)}
        title="删除这条记忆？"
        description="删除后，记忆记录不会再作为后续交流的个人背景。历史对话仍会保留。"
        label="删除记忆"
        error={error}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
      />
    </div>
  );
}
