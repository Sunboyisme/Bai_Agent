import { useState } from "react";
import {
  Cable,
  Check,
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { api, type Settings } from "@/lib/api";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { SoftSelect } from "./ui/soft-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { ConfirmDelete, ErrorNotice } from "./common";

type Connection = Settings["providers"][number];
type Draft = Connection & { api_key?: string | null };
const thinkingOptions = [
  { value: "auto", label: "自动识别" },
  { value: "none", label: "不支持思考" },
  { value: "always", label: "始终思考" },
  { value: "enable_thinking", label: "enable_thinking 开关" },
  { value: "thinking", label: "thinking.type 开关" },
  { value: "reasoning_effort", label: "reasoning_effort 开关" },
];
const blankModel = () => ({
  name: "",
  vision_enabled: false,
  thinking_mode: "auto" as const,
  thinking_control: "none" as const,
});

export function ModelConnections({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (value: Settings) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<Connection | null>(null);
  const connections = settings.providers;
  const presets = settings.provider_presets;
  const defaultConnection = connections.find(
    (x) => x.id === settings.default_provider,
  );
  const defaultKey = defaultConnection?.default_model
    ? `${defaultConnection.id}:${defaultConnection.default_model}`
    : "";
  const options = connections.flatMap((connection) =>
    connection.models.map((model) => ({
      value: `${connection.id}:${model.name}`,
      label: `${connection.label} · ${model.name}`,
    })),
  );
  function uniqueLabel(label: string) {
    let name = label,
      i = 2;
    while (connections.some((x) => x.label === name)) name = `${label} ${i++}`;
    return name;
  }
  function add() {
    const preset = presets[0];
    setIsNew(true);
    setError("");
    setNotice("");
    setDraft({
      id: `conn_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      provider_type: preset.id,
      label: uniqueLabel(preset.label),
      model_url: preset.model_url,
      default_model: preset.models[0]?.name || "",
      key_configured: false,
      models: preset.models.length
        ? preset.models.map((x) => ({ ...blankModel(), ...x }))
        : [blankModel()],
    });
  }
  function edit(value: Connection) {
    setIsNew(false);
    setError("");
    setNotice("");
    setDraft({
      ...value,
      models: value.models.length
        ? value.models.map((x) => ({ ...x }))
        : [blankModel()],
    });
  }
  function switchPreset(id: string) {
    if (!draft) return;
    const preset = presets.find((x) => x.id === id)!;
    setDraft({
      ...draft,
      provider_type: preset.id,
      label: uniqueLabel(preset.label),
      model_url: preset.model_url,
      api_key: null,
      key_configured: false,
      models: preset.models.length
        ? preset.models.map((x) => ({ ...blankModel(), ...x }))
        : [blankModel()],
      default_model: preset.models[0]?.name || "",
    });
  }
  function updateModel(index: number, patch: Partial<Draft["models"][number]>) {
    if (!draft) return;
    const models = draft.models.map((x, i) =>
      i === index ? { ...x, ...patch } : x,
    );
    setDraft({
      ...draft,
      models,
      default_model:
        draft.models[index].name === draft.default_model &&
        patch.name !== undefined
          ? patch.name
          : draft.default_model,
    });
  }
  async function save(test = false) {
    if (!draft) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!draft.label.trim()) throw new Error("请填写连接名称。");
      const models = draft.models
        .filter((x) => x.name.trim())
        .map((x) => ({ ...x, name: x.name.trim() }));
      if (!models.length) throw new Error("请添加至少一个模型。");
      if (new Set(models.map((x) => x.name)).size !== models.length)
        throw new Error("模型名称不能重复。");
      const profile = {
        id: draft.id,
        provider_type: draft.provider_type,
        label: draft.label.trim(),
        model_url: draft.model_url,
        models,
        default_model: models.some((x) => x.name === draft.default_model.trim())
          ? draft.default_model.trim()
          : models[0].name,
        api_key: draft.api_key ?? null,
      };
      const value = await api<Settings>("/settings", "PUT", {
        providers: [profile],
        timezone: settings.timezone,
      });
      onSaved(value);
      if (test) {
        setDraft(value.providers.find((x) => x.id === draft.id)!);
        setIsNew(false);
        const result = await api<{ message: string }>(
          "/settings/test",
          "POST",
          {
            provider_id: draft.id,
            model_name: profile.default_model,
            thinking_enabled: false,
          },
        );
        setNotice(result.message);
      } else {
        setDraft(null);
        setNotice("连接已保存");
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function chooseDefault(key: string) {
    const split = key.indexOf(":"),
      id = key.slice(0, split),
      model = key.slice(split + 1);
    const connection = connections.find((x) => x.id === id)!;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      onSaved(
        await api<Settings>("/settings", "PUT", {
          providers: [{ ...connection, default_model: model }],
          default_provider: id,
          timezone: settings.timezone,
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      onSaved(
        await api<Settings>(`/settings/providers/${deleting.id}`, "DELETE"),
      );
      setDeleting(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-section model-connections">
      <div className="connections-heading">
        <div>
          <h2>模型连接</h2>
          <p>管理接口与模型</p>
        </div>
        <Button variant="outline" size="sm" onClick={add} disabled={busy}>
          <Plus size={15} />
          添加连接
        </Button>
      </div>
      {!draft && error && <ErrorNotice message={error} />}
      {!draft && notice && (
        <p className="connection-notice" role="status">
          <Check size={14} />
          {notice}
        </p>
      )}
      <div className="connection-list">
        {connections.map((connection) => (
          <div className="connection-card" key={connection.id}>
            <button
              className="connection-card-main"
              onClick={() => edit(connection)}
              aria-label={`编辑连接 ${connection.label}`}
            >
              <span className="connection-symbol">
                <Cable size={20} />
              </span>
              <span className="connection-card-copy">
                <span className="connection-card-title">
                  <strong>{connection.label}</strong>
                  {settings.default_provider === connection.id && (
                    <small className="default-badge">默认</small>
                  )}
                </span>
                <span className="connection-card-meta">
                  {presets.find((x) => x.id === connection.provider_type)
                    ?.label || "自定义"}{" "}
                  · {connection.models.length} 个模型
                </span>
                <span className="connection-card-models">
                  {connection.models.map((x) => x.name).join(" / ") ||
                    "尚未添加模型"}
                </span>
              </span>
            </button>
            <span
              className={`connection-state ${connection.key_configured && connection.models.length ? "ready" : ""}`}
            >
              <i />
              {connection.key_configured && connection.models.length
                ? "已配置"
                : "待配置"}
            </span>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="icon-button"
                  aria-label={`${connection.label} 更多操作`}
                >
                  <MoreHorizontal size={18} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="model-menu"
                  align="end"
                  sideOffset={5}
                >
                  <DropdownMenu.Item
                    className="model-menu-item"
                    onSelect={() => edit(connection)}
                  >
                    编辑连接
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="model-menu-item danger"
                    onSelect={() => setDeleting(connection)}
                  >
                    删除连接
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        ))}
      </div>
      {connections.length === 0 && (
        <button className="connection-empty" onClick={add}>
          <span className="connection-symbol">
            <Cable size={24} />
          </span>
          <strong>添加第一个模型连接</strong>
          <span>阿里云百炼、DeepSeek、Kimi、智谱、硅基流动或自定义接口</span>
        </button>
      )}
      {options.length > 0 && (
        <div className="connection-default">
          <Label htmlFor="default-model">默认模型</Label>
          <SoftSelect
            id="default-model"
            label="默认模型"
            value={defaultKey}
            disabled={busy}
            onValueChange={(v) => void chooseDefault(v)}
            options={options}
          />
        </div>
      )}
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDraft(null);
            setError("");
            setNotice("");
          }
        }}
      >
        <DialogContent className="model-dialog">
          <DialogHeader>
            <DialogTitle>{isNew ? "添加模型连接" : "编辑模型连接"}</DialogTitle>
            <DialogDescription>
              每套连接独立保存接口、密钥和模型。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <>
              <div className="model-dialog-body">
                {error && <ErrorNotice message={error} />}{" "}
                {notice && (
                  <p className="connection-notice" role="status">
                    {notice}
                  </p>
                )}
                <div className="connection-form-grid">
                  <div className="form-field">
                    <Label htmlFor="connection-name">连接名称</Label>
                    <Input
                      id="connection-name"
                      value={draft.label}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft({ ...draft, label: e.target.value })
                      }
                      placeholder="例如：工作用 DeepSeek"
                    />
                  </div>
                  <div className="form-field">
                    <Label htmlFor="provider-select">服务商</Label>
                    <SoftSelect
                      id="provider-select"
                      label="服务商"
                      value={draft.provider_type}
                      disabled={busy || !isNew}
                      onValueChange={switchPreset}
                      options={presets.map((x) => ({
                        value: x.id,
                        label: x.label,
                      }))}
                    />
                  </div>
                </div>
                <div className="form-field">
                  <Label htmlFor="model-url">接口地址</Label>
                  <Input
                    id="model-url"
                    value={draft.model_url}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({ ...draft, model_url: e.target.value })
                    }
                  />
                </div>
                <div className="form-field">
                  <Label htmlFor="model-key">API 密钥</Label>
                  <Input
                    id="model-key"
                    type="password"
                    autoComplete="new-password"
                    value={draft.api_key || ""}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({ ...draft, api_key: e.target.value || null })
                    }
                    placeholder={
                      draft.key_configured
                        ? "已保存；留空保持原密钥"
                        : "输入 API 密钥"
                    }
                  />
                  {draft.key_configured && (
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => setDraft({ ...draft, api_key: "" })}
                    >
                      {draft.api_key === ""
                        ? "保存后清除密钥"
                        : "清除已保存的密钥"}
                    </button>
                  )}
                </div>
                <div className="connection-model-section">
                  <div className="models-heading">
                    <h3>模型</h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          models: [...draft.models, blankModel()],
                        })
                      }
                    >
                      <Plus size={14} />
                      添加模型
                    </Button>
                  </div>
                  <div className="model-editor-list">
                    {draft.models.map((model, index) => (
                      <div className="connection-model-row" key={index}>
                        <div className="model-name-row">
                          <Input
                            aria-label={
                              index === 0 ? "模型名称" : `模型名称 ${index + 1}`
                            }
                            value={model.name}
                            disabled={busy}
                            placeholder="模型名称"
                            onChange={(e) =>
                              updateModel(index, { name: e.target.value })
                            }
                          />
                          <button
                            className="icon-button"
                            aria-label={`移除模型 ${index + 1}`}
                            disabled={busy}
                            onClick={() => {
                              const models = draft.models.filter(
                                (_, i) => i !== index,
                              );
                              setDraft({
                                ...draft,
                                models,
                                default_model:
                                  draft.default_model === model.name
                                    ? models[0]?.name || ""
                                    : draft.default_model,
                              });
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <details className="model-advanced">
                          <summary>
                            能力设置
                            <ChevronDown size={12} />
                          </summary>
                          <div className="model-capabilities">
                            <label className="model-vision">
                              <Checkbox
                                checked={model.vision_enabled}
                                disabled={busy}
                                onCheckedChange={(v) =>
                                  updateModel(index, {
                                    vision_enabled: v === true,
                                  })
                                }
                              />
                              图片输入
                            </label>
                            <SoftSelect
                              label={`模型 ${index + 1} 思考配置`}
                              value={model.thinking_mode || "auto"}
                              disabled={busy}
                              onValueChange={(v) =>
                                updateModel(index, {
                                  thinking_mode:
                                    v as typeof model.thinking_mode,
                                })
                              }
                              options={thinkingOptions}
                            />
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  保存并测试模型
                </Button>
                <Button disabled={busy} onClick={() => void save()}>
                  {busy && <Loader2 size={15} className="spin" />}保存连接
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDelete
        open={Boolean(deleting)}
        onClose={() => {
          setDeleting(null);
          setError("");
        }}
        label="删除连接"
        error={error}
        title={`删除 ${deleting?.label || "连接"}？`}
        description="这套连接的接口配置和已保存的密钥将一并移除。"
        onConfirm={remove}
      />
    </section>
  );
}
