import { useState } from "react";
import { Brain, Check, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { api, type Memory } from "@/lib/api";
import { dateTime } from "@/lib/utils";
import { ConfirmDelete, EmptyState, ErrorNotice } from "./common";

const categories: Record<string, string> = {
  fact: "个人事实",
  preference: "偏好",
  project: "项目状态",
};
export function MemoryPage({
  memories,
  refresh,
  createRequested,
}: {
  memories: Memory[];
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
          state: editing?.state || "confirmed",
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
  async function confirm(value: Memory) {
    try {
      await api(`/memories/${value.id}`, "PUT", {
        content: value.content,
        category: value.category,
        source: value.source,
        state: "confirmed",
      });
      await refresh();
    } catch (error) {
      setError((error as Error).message);
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
  const candidates = memories.filter((x) => x.state === "candidate");
  const values = memories.filter(
    (x) => x.state === "confirmed" && x.content.includes(query),
  );
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">让每次交流都从了解你开始</p>
          <h1>记忆</h1>
          <p>你决定 Bai 记住什么，也可以随时修改或删除。</p>
        </div>
        <Button onClick={() => edit()}>
          <Plus size={16} />
          添加记忆
        </Button>
      </div>
      {error && <ErrorNotice message={error} />}
      {candidates.length > 0 && (
        <section className="candidate-section">
          <h2>
            等待你确认 <span>{candidates.length}</span>
          </h2>
          <p>这些内容由交流归纳，确认后才会作为你的个人背景。</p>
          {candidates.map((value) => (
            <div className="candidate-row" key={value.id}>
              <p>{value.content}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void confirm(value)}
              >
                <Check size={14} />
                确认记住
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="删除候选记忆"
                onClick={() => setDeleting(value)}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </section>
      )}
      {memories.some((x) => x.state === "confirmed") && (
        <div className="search-field">
          <Search size={17} />
          <Input
            aria-label="搜索记忆"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索已确认的记忆…"
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
              <div className="memory-source">
                {value.source}
                <span>{dateTime(value.updated_at)}</span>
              </div>
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
              保存记忆
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
