import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Compass,
  FileQuestion,
  GraduationCap,
  Loader2,
  Plus,
  RotateCcw,
  SkipForward,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
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
import {
  api,
  readEvents,
  type Goal,
  type Node,
  type Lesson,
  type Run,
  type Attachment,
} from "@/lib/api";
import {
  EmptyState,
  ErrorNotice,
  ImagesInput,
  Markdown,
  nodeStatus,
  ConfirmDelete,
} from "./common";

export function LearningPage({
  goals,
  refresh,
  onSettings,
  createRequested,
}: {
  goals: Goal[];
  refresh: () => Promise<void>;
  onSettings: () => void;
  createRequested?: number;
}) {
  const [goalId, setGoalId] = useState(
    localStorage.getItem("bai-current-goal") || "",
  );
  const [nodeId, setNodeId] = useState("");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [open, setOpen] = useState(Boolean(createRequested));
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [foundation, setFoundation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [answer, setAnswer] = useState("");
  const [images, setImages] = useState<Attachment[]>([]);
  const [hints, setHints] = useState(false);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const watch = useRef<AbortController | null>(null);
  const activeNode = useRef(nodeId);
  activeNode.current = nodeId;
  const selectedGoal = goals.find((x) => x.id === goalId);
  const goal = selectedGoal || null;
  const node = goal?.nodes.find((x) => x.id === nodeId);
  function selectGoal(value: Goal) {
    watch.current?.abort();
    setBusy(false);
    setRun(null);
    setGoalId(value.id);
    localStorage.setItem("bai-current-goal", value.id);
    setNodeId(value.current_node_id || value.nodes[0]?.id || "");
    setError("");
    setAnswer("");
    setImages([]);
  }
  useEffect(() => {
    if (selectedGoal && !nodeId)
      setNodeId(
        selectedGoal.current_node_id || selectedGoal.nodes[0]?.id || "",
      );
  }, [selectedGoal, nodeId]);
  useEffect(() => {
    let live = true;
    setLesson(null);
    setHints(false);
    if (nodeId)
      api<Lesson | null>(`/learning/nodes/${nodeId}/lesson`)
        .then((value) => {
          if (live) setLesson(value);
        })
        .catch((error) => {
          if (live) setError(error.message);
        });
    return () => {
      live = false;
    };
  }, [nodeId]);
  async function finishRun(
    value: Run,
    signal: AbortSignal,
    targetNode?: string,
  ) {
    await refresh();
    if (signal.aborted) return;
    if (value.status === "failed") setError(value.error || "本次执行未完成");
    const target =
      targetNode || String(value.result?.node_id || activeNode.current || "");
    if (target) {
      const latest = await api<Lesson | null>(
        `/learning/nodes/${target}/lesson`,
      );
      if (signal.aborted) return;
      if (activeNode.current === target) setLesson(latest);
    }
    setRun(value);
    setBusy(false);
  }
  async function track(value: Run, targetNode?: string) {
    watch.current?.abort();
    const controller = new AbortController();
    watch.current = controller;
    setRun(value);
    setBusy(true);
    try {
      const result = await readEvents(value.id, () => {}, controller.signal);
      if (!controller.signal.aborted)
        await finishRun(result, controller.signal, targetNode);
    } catch (error) {
      if (!controller.signal.aborted) {
        setError((error as Error).message);
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    let live = true;
    if (goalId)
      api<Run[]>(`/runs?goal_id=${goalId}`)
        .then((values) => {
          if (!live) return;
          const active = values.find((x) =>
            ["queued", "running"].includes(x.status),
          );
          if (active) void track(active, nodeId || undefined);
        })
        .catch(() => {});
    return () => {
      live = false;
      watch.current?.abort();
    };
    // Track is intentionally scoped to a selected goal; API completion reads fresh data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const value = await api<Goal>("/learning/goals", "POST", {
        title,
        objective,
        foundation,
      });
      await refresh();
      selectGoal(value);
      setOpen(false);
      setTitle("");
      setObjective("");
      setFoundation("");
      const next = await api<Run>(`/learning/goals/${value.id}/plan`, "POST");
      void track(next);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  async function plan() {
    if (!goal || busy) return;
    setError("");
    setBusy(true);
    try {
      void track(await api<Run>(`/learning/goals/${goal.id}/plan`, "POST"));
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  async function teach(value: Node) {
    if (busy) return;
    setBusy(true);
    setNodeId(value.id);
    setError("");
    setAnswer("");
    setImages([]);
    try {
      void track(
        await api<Run>(`/learning/nodes/${value.id}/lesson`, "POST"),
        value.id,
      );
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  async function submit() {
    if (!lesson || !node || busy || uploading) return;
    setError("");
    setBusy(true);
    try {
      const value = await api<Run>(
        `/learning/lessons/${lesson.id}/submit`,
        "POST",
        {
          submission_id: crypto.randomUUID(),
          answer,
          attachment_ids: images.map((x) => x.id),
        },
      );
      void track(value, node.id);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  async function skip() {
    if (!node) return;
    setError("");
    try {
      await api(`/learning/nodes/${node.id}/skip`, "POST");
      await refresh();
      const next = goal?.nodes.find(
        (x) =>
          x.ordinal > node.ordinal && !["passed", "skipped"].includes(x.status),
      );
      if (next) setNodeId(next.id);
      else setLesson(null);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function reviewReminder() {
    if (!node) return;
    try {
      await api("/reminders", "POST", {
        title: `复习：${node.title}`,
        body: `学习主题：${goal?.title}`,
        due_at: new Date(Date.now() + 86400000).toISOString(),
        timezone: "Asia/Shanghai",
        recurrence: "none",
      });
      await refresh();
      setError("");
      setNotice("已创建明天同一时间的复习提醒，可在提醒页调整。");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const feedback = lesson?.feedback as
    | {
        passed?: boolean;
        explanation?: string;
        strengths?: string[];
        gaps?: string[];
        next_step?: string;
        evidence?: string;
      }
    | undefined;
  const next = goal?.nodes.find(
    (x) =>
      !["passed", "skipped"].includes(x.status) &&
      x.ordinal > (node?.ordinal ?? -1),
  );
  return (
    <div className={`learning-page ${goal ? "has-course" : "page-content"}`}>
      {!goal ? (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">从想学，到真正会用</p>
              <h1>学习</h1>
              <p>先看总体框架，再用一个个小练习把知识连起来。</p>
            </div>
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} />
              新的学习目标
            </Button>
          </div>
          {error && <ErrorNotice message={error} />}
          {goals.length ? (
            <div className="goal-grid">
              {goals.map((value) => {
                const passed = value.nodes.filter(
                  (x) => x.status === "passed",
                ).length;
                return (
                  <button
                    className="goal-card"
                    key={value.id}
                    onClick={() => selectGoal(value)}
                  >
                    <div className="goal-card-top">
                      <div className="topic-icon">
                        <BookOpen size={22} />
                      </div>
                      <span>
                        {value.nodes.length
                          ? `${passed} / ${value.nodes.length} 练习通过`
                          : "等待规划"}
                      </span>
                    </div>
                    <h2>{value.title}</h2>
                    <p>{value.objective || "从基础入门，逐步完成实际练习。"}</p>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${value.nodes.length ? (passed / value.nodes.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="goal-card-footer">
                      <span>
                        {value.nodes.find((x) => x.id === value.current_node_id)
                          ?.title || "建立你的知识框架"}
                      </span>
                      <ArrowRight size={17} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="learning-intro">
                <div className="learning-orbit">
                  <GraduationCap size={43} />
                  <span />
                  <span />
                </div>
                <h2>你想学的，都可以从这里开始。</h2>
                <p>
                  做饭、养猫、游戏、编程……
                  <br />
                  告诉 Bai 你的目标与基础，它会陪你一步一步学。
                </p>
                <Button onClick={() => setOpen(true)}>
                  <Plus size={16} />
                  建立第一个学习目标
                </Button>
              </div>
              <div className="learning-method">
                <div>
                  <Compass size={21} />
                  <h3>先有框架</h3>
                  <p>看清知识全貌和学习顺序。</p>
                </div>
                <div>
                  <Target size={21} />
                  <h3>每次一小步</h3>
                  <p>讲解、示例、练习和具体反馈。</p>
                </div>
                <div>
                  <RotateCcw size={21} />
                  <h3>接着上次学</h3>
                  <p>保存进度，回补没掌握的地方。</p>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="course-layout">
          <aside className="course-outline">
            <button
              className="back-link"
              onClick={() => {
                setGoalId("");
                setNodeId("");
                setRun(null);
                setBusy(false);
              }}
            >
              <ArrowLeft size={15} />
              所有学习目标
            </button>
            <div className="course-title">
              <span className="eyebrow">你的知识地图</span>
              <h2>{goal.title}</h2>
              <p>{goal.objective}</p>
            </div>
            <div className="course-progress">
              <strong>
                {goal.nodes.filter((x) => x.status === "passed").length}
              </strong>
              <span> / {goal.nodes.length} 个知识点练习通过</span>
            </div>
            <div className="outline-items">
              {goal.nodes.map((value, i) => (
                <div key={value.id}>
                  {i === 0 || goal.nodes[i - 1].module !== value.module ? (
                    <p className="module-label">{value.module}</p>
                  ) : null}
                  <button
                    className={`outline-node ${nodeId === value.id ? "active" : ""}`}
                    disabled={busy}
                    onClick={() => {
                      setNodeId(value.id);
                      setAnswer("");
                      setImages([]);
                    }}
                  >
                    <span className={`node-symbol ${value.status}`}>
                      {value.status === "passed" ? (
                        <Check size={13} />
                      ) : value.status === "skipped" ? (
                        <SkipForward size={12} />
                      ) : (
                        <Circle size={12} />
                      )}
                    </span>
                    <span>
                      {value.title}
                      <small>{nodeStatus[value.status]}</small>
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="delete-course"
              onClick={() => setDeleting(goal)}
            >
              <Trash2 size={14} />
              删除学习目标
            </Button>
          </aside>
          <div className="lesson-content">
            {notice && (
              <p className="success-notice" role="status">
                {notice}
              </p>
            )}
            {error && <ErrorNotice message={error} />}
            <div className="lesson-topline">
              <span>{node?.module || "课程规划"}</span>
              {busy && (
                <span className="working-label">
                  <Loader2 size={14} className="spin" />
                  {run?.kind === "course"
                    ? "正在建立知识框架"
                    : run?.kind === "assessment"
                      ? "正在检查练习"
                      : "正在准备教学"}
                  <button
                    onClick={() => {
                      if (run) void api(`/runs/${run.id}/cancel`, "POST");
                    }}
                  >
                    停止
                  </button>
                </span>
              )}
            </div>
            {!goal.nodes.length ? (
              <EmptyState
                icon={Compass}
                title="准备你的学习路线"
                action={
                  <div className="empty-actions">
                    <Button onClick={() => void plan()} disabled={busy}>
                      <Sparkles size={15} />
                      生成知识框架
                    </Button>
                    <Button variant="ghost" onClick={onSettings}>
                      检查模型设置
                    </Button>
                  </div>
                }
              >
                Bai 将根据你的目标与基础，规划模块、知识点和练习。
              </EmptyState>
            ) : node ? (
              <>
                <div className="lesson-heading">
                  <span className={`small-label ${node.status}`}>
                    {nodeStatus[node.status]}
                  </span>
                  <h1>{node.title}</h1>
                  <p>{node.objective}</p>
                </div>
                {node.prerequisites.length > 0 && (
                  <div className="prerequisite-line">
                    前置知识：
                    {node.prerequisites
                      .map((id) => goal.nodes.find((x) => x.id === id)?.title)
                      .filter(Boolean)
                      .join("、")}
                  </div>
                )}
                {lesson ? (
                  <>
                    <Markdown>{lesson.content}</Markdown>
                    <section className="exercise-box">
                      <div className="section-title">
                        <FileQuestion size={20} />
                        <div>
                          <h2>现在轮到你试一试</h2>
                          <p>可以用文字、代码片段或图片提交。</p>
                        </div>
                      </div>
                      <Markdown>{lesson.exercise}</Markdown>
                      <div className="exercise-criteria">
                        <strong>检查标准</strong>
                        <p>{lesson.criteria}</p>
                      </div>
                      {lesson.hints.length > 0 && (
                        <>
                          <button
                            className="text-button"
                            onClick={() => setHints(!hints)}
                          >
                            {hints ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                            需要一点提示
                          </button>
                          {hints && (
                            <ul className="hint-list">
                              {lesson.hints.map((hint, i) => (
                                <li key={i}>{hint}</li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                      {lesson.state === "awaiting_submission" ? (
                        <>
                          <Textarea
                            aria-label="练习回答"
                            rows={5}
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder="写下你的理解、操作结果或代码…"
                            disabled={busy}
                          />
                          <div className="exercise-submit">
                            <ImagesInput
                              images={images}
                              onChange={setImages}
                              disabled={busy}
                              onError={setError}
                              onUploading={setUploading}
                            />
                            <Button
                              disabled={
                                busy ||
                                uploading ||
                                (!answer.trim() && !images.length)
                              }
                              onClick={() => void submit()}
                            >
                              {busy ? (
                                <Loader2 size={15} className="spin" />
                              ) : (
                                <ArrowRight size={15} />
                              )}
                              提交练习
                            </Button>
                          </div>
                        </>
                      ) : feedback?.explanation ? (
                        <div
                          className={`feedback-box ${feedback.passed ? "passed" : "needs-practice"}`}
                        >
                          <h3>
                            {feedback.passed ? (
                              <CheckCircle2 size={19} />
                            ) : (
                              <RotateCcw size={19} />
                            )}{" "}
                            {feedback.passed
                              ? "这次练习通过了"
                              : "这里还需要再练一练"}
                          </h3>
                          <Markdown>{feedback.explanation}</Markdown>
                          {feedback.gaps?.length ? (
                            <ul>
                              {feedback.gaps.map((gap, i) => (
                                <li key={i}>{gap}</li>
                              ))}
                            </ul>
                          ) : null}
                          <p>
                            <strong>下一步：</strong>
                            {feedback.next_step}
                          </p>
                          <p className="feedback-evidence">
                            反馈依据：{feedback.evidence}
                          </p>
                          <div className="feedback-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => void teach(node)}
                            >
                              <RotateCcw size={14} />
                              {feedback.passed ? "再练一次" : "补讲并重新练习"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void reviewReminder()}
                            >
                              安排复习提醒
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="muted">本次练习已跳过，尚未验证。</p>
                      )}
                    </section>
                  </>
                ) : (
                  <div className="start-lesson">
                    <BookOpen size={30} />
                    <h2>一次只学一个知识点</h2>
                    <p>先理解用途和概念，再通过一个具体练习检查自己。</p>
                    <Button disabled={busy} onClick={() => void teach(node)}>
                      <Sparkles size={16} />
                      开始这个知识点
                    </Button>
                  </div>
                )}
                <div className="lesson-footer">
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void skip()}
                  >
                    <SkipForward size={15} />
                    跳过，保留未验证状态
                  </Button>
                  {next && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setNodeId(next.id);
                        setAnswer("");
                        setImages([]);
                      }}
                    >
                      下一个知识点
                      <ArrowRight size={15} />
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>你想学什么？</DialogTitle>
            <DialogDescription>
              从一个具体目标开始，Bai 会为你建立知识框架。
            </DialogDescription>
          </DialogHeader>
          {error && <ErrorNotice message={error} />}
          <div className="form-field">
            <Label htmlFor="goal-title">学习主题</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：家常菜、养猫、前端开发、某款游戏"
            />
          </div>
          <div className="form-field">
            <Label htmlFor="goal-objective">你希望学到什么程度</Label>
            <Textarea
              id="goal-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="例如：能独立做出三道日常晚餐，知道如何安排步骤。"
            />
          </div>
          <div className="form-field">
            <Label htmlFor="goal-foundation">
              目前的基础 <span className="muted">选填</span>
            </Label>
            <Textarea
              id="goal-foundation"
              value={foundation}
              onChange={(e) => setFoundation(e.target.value)}
              rows={3}
              placeholder="已经会什么，在哪些地方容易卡住？"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!title.trim() || busy}
              onClick={() => void create()}
            >
              <Sparkles size={15} />
              建立学习路线
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDelete
        open={Boolean(deleting)}
        title="删除这个学习目标？"
        description="课程、练习和进度会一起删除。"
        label="删除目标"
        error={error}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/learning/goals/${deleting.id}`, "DELETE");
            await refresh();
            setDeleting(null);
            setGoalId("");
            setNodeId("");
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      />
    </div>
  );
}
