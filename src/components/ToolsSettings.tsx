import { SoftSelect } from "./ui/soft-select";
import { useCallback, useEffect, useState } from "react";
import {
  Cable,
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api, type MCPServer, type MCPServerWrite, type Tool } from "@/lib/api";
import { parseMCPConfig } from "@/lib/mcp-config";
import { ConfirmDelete, ErrorNotice } from "./common";

const phases: Record<MCPServer["status"], string> = {
  disabled: "已停用",
  disconnected: "未连接",
  connecting: "连接中",
  connected: "已连接",
  error: "连接失败",
};
type SecretRow = {
  id: string;
  key: string;
  value: string;
  saved: boolean;
  remove: boolean;
};
function secretRows(values: Record<string, boolean>): SecretRow[] {
  return Object.entries(values).map(([key, saved]) => ({
    id: crypto.randomUUID(),
    key,
    value: "",
    saved,
    remove: false,
  }));
}

function SecretFields({
  label,
  rows,
  setRows,
}: {
  label: string;
  rows: SecretRow[];
  setRows: (rows: SecretRow[]) => void;
}) {
  return (
    <fieldset className="mcp-secrets">
      <legend>{label}</legend>
      {rows.map(
        (row, index) =>
          !row.remove && (
            <div className="mcp-secret-row" key={row.id}>
              <Input
                aria-label={`${label}名称 ${index + 1}`}
                disabled={row.saved}
                value={row.key}
                placeholder="名称"
                onChange={(event) =>
                  setRows(
                    rows.map((x) =>
                      x.id === row.id ? { ...x, key: event.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                aria-label={`${label}值 ${index + 1}`}
                type="password"
                autoComplete="new-password"
                value={row.value}
                placeholder={row.saved ? "已保存；留空保留" : "值"}
                onChange={(event) =>
                  setRows(
                    rows.map((x) =>
                      x.id === row.id ? { ...x, value: event.target.value } : x,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`移除${label} ${row.key || index + 1}`}
                onClick={() =>
                  setRows(
                    rows.map((x) =>
                      x.id === row.id ? { ...x, remove: true } : x,
                    ),
                  )
                }
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ),
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          setRows([
            ...rows,
            {
              id: crypto.randomUUID(),
              key: "",
              value: "",
              saved: false,
              remove: false,
            },
          ])
        }
      >
        <Plus size={14} />
        添加{label}
      </Button>
    </fieldset>
  );
}

function ServerEditor({
  server,
  onClose,
  onSaved,
}: {
  server: MCPServer | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(server?.name || "");
  const [transport, setTransport] = useState<MCPServer["transport"]>(
    server?.transport || "streamable_http",
  );
  const [url, setUrl] = useState(server?.url || "");
  const [command, setCommand] = useState(server?.command || "");
  const [args, setArgs] = useState(JSON.stringify(server?.args || [], null, 2));
  const [cwd, setCwd] = useState(server?.cwd || "");
  const [headers, setHeaders] = useState(() =>
    secretRows(server?.headers || {}),
  );
  const [env, setEnv] = useState(() => secretRows(server?.env || {}));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      let parsed: unknown = [];
      if (transport === "stdio") {
        try {
          parsed = JSON.parse(args);
        } catch {
          throw new Error('参数需要填写 JSON 字符串数组，例如 ["server.py"]');
        }
        if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== "string"))
          throw new Error("参数需要填写 JSON 字符串数组");
      }
      const values = (rows: SecretRow[]) => {
        const active = rows.filter((x) => !x.remove);
        if (
          active.some((x) => !x.key.trim()) ||
          new Set(active.map((x) => x.key.toLowerCase())).size !== active.length
        )
          throw new Error("凭据名称不能为空或重复");
        return Object.fromEntries(active.map((x) => [x.key, x.value || null]));
      };
      const value: MCPServerWrite = {
        name,
        transport,
        enabled: server?.enabled || false,
        url: transport === "streamable_http" ? url : "",
        command: transport === "stdio" ? command : "",
        args: parsed as string[],
        cwd: transport === "stdio" ? cwd : "",
        headers: transport === "streamable_http" ? values(headers) : {},
        env: transport === "stdio" ? values(env) : {},
        clear_headers: headers
          .filter((x) => x.remove && x.saved)
          .map((x) => x.key),
        clear_env: env.filter((x) => x.remove && x.saved).map((x) => x.key),
      };
      await api(
        server ? `/mcp/servers/${server.id}` : "/mcp/servers",
        server ? "PUT" : "POST",
        value,
      );
      await onSaved();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="mcp-dialog"
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {server ? "编辑 MCP 服务" : "添加 MCP 服务"}
          </DialogTitle>
          <DialogDescription>
            保存配置后，测试连接并选择要启用的工具。
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorNotice message={error} />}
        <div className="mcp-editor-fields">
          <div className="form-field">
            <Label htmlFor="mcp-name">名称</Label>
            <Input
              id="mcp-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="mcp-transport">连接方式</Label>
            <SoftSelect
              id="mcp-transport"
              label="连接方式"
              value={transport}
              onValueChange={(v) => setTransport(v as MCPServer["transport"])}
              options={[
                { value: "streamable_http", label: "远程 HTTP" },
                { value: "stdio", label: "本地 stdio" },
              ]}
            />
          </div>
          {transport === "streamable_http" ? (
            <>
              <div className="form-field">
                <Label htmlFor="mcp-url">服务地址</Label>
                <Input
                  id="mcp-url"
                  placeholder="https://example.com/mcp"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
              <SecretFields
                label="请求头"
                rows={headers}
                setRows={setHeaders}
              />
            </>
          ) : (
            <>
              <div className="form-field">
                <Label htmlFor="mcp-command">启动命令</Label>
                <Input
                  id="mcp-command"
                  placeholder="node、python 或可执行文件绝对路径"
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                />
              </div>
              <div className="form-field">
                <Label htmlFor="mcp-args">参数（JSON 数组）</Label>
                <Textarea
                  id="mcp-args"
                  value={args}
                  onChange={(event) => setArgs(event.target.value)}
                />
              </div>
              <div className="form-field">
                <Label htmlFor="mcp-cwd">工作目录（可选）</Label>
                <Input
                  id="mcp-cwd"
                  value={cwd}
                  onChange={(event) => setCwd(event.target.value)}
                />
              </div>
              <SecretFields label="环境变量" rows={env} setRows={setEnv} />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || !name.trim()} onClick={() => void save()}>
            {busy && <Loader2 size={15} className="spin" />}保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  names,
  onClose,
  onSaved,
}: {
  names: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<MCPServerWrite[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function inspect() {
    setError("");
    setPreview(null);
    try {
      const parsed = parseMCPConfig(text);
      if (parsed.some((x) => names.includes(x.name)))
        throw new Error("存在同名服务，请在 JSON 中重命名后重新预览");
      setPreview(parsed);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await api("/mcp/servers/import", "POST", JSON.parse(text));
      setText("");
      setPreview(null);
      await onSaved();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="mcp-dialog">
        <DialogHeader>
          <DialogTitle>导入 MCP 配置</DialogTitle>
          <DialogDescription>
            预览与保存不启动服务，凭据值不会显示在预览中。
          </DialogDescription>
        </DialogHeader>
        <div className="form-field">
          <Label htmlFor="mcp-json">mcpServers JSON</Label>
          <Textarea
            id="mcp-json"
            className="mcp-json"
            spellCheck={false}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPreview(null);
              setError("");
            }}
            placeholder={
              '{ "mcpServers": { "示例": { "url": "https://example.com/mcp" } } }'
            }
          />
        </div>
        {error && <ErrorNotice message={error} />}
        {preview && (
          <ul className="mcp-import-preview" aria-label="导入预览">
            {preview.map((item) => (
              <li key={item.name}>
                <Check size={15} />
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.transport === "stdio" ? item.command : item.url}
                  </span>
                  <small>
                    {Object.keys(item.headers || {}).length} 个请求头 ·{" "}
                    {Object.keys(item.env || {}).length} 个环境变量
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="outline"
            disabled={busy || !text.trim()}
            onClick={inspect}
          >
            预览
          </Button>
          <Button disabled={busy || !preview} onClick={() => void save()}>
            {busy && <Loader2 size={15} className="spin" />}确认导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolRow({
  tool,
  busy,
  onToggle,
}: {
  tool: Tool;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="managed-tool-row">
      <div className="managed-tool-copy">
        <strong>{tool.name}</strong>
        <p>{tool.description}</p>
        <small className={tool.available ? "" : "tool-unavailable"}>
          {tool.note}
        </small>
      </div>
      <label className="tool-switch">
        <Checkbox
          checked={tool.enabled}
          disabled={busy}
          onCheckedChange={onToggle}
          aria-label={`启用 ${tool.source_label} · ${tool.name}`}
        />
        <span>{tool.enabled ? "已启用" : "已关闭"}</span>
      </label>
    </div>
  );
}

export function ToolsSettings({ active }: { active: boolean }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MCPServer | null | undefined>(
    undefined,
  );
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<MCPServer | null>(null);
  const load = useCallback(async () => {
    const [nextTools, nextServers] = await Promise.all([
      api<Tool[]>("/tools"),
      api<MCPServer[]>("/mcp/servers"),
    ]);
    setTools(nextTools);
    setServers(nextServers);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    async function refresh() {
      try {
        if (!stopped) await load();
      } catch (error) {
        if (!stopped) setError((error as Error).message);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, load]);
  async function act(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const match = (tool: Tool) =>
    `${tool.name} ${tool.description} ${tool.source_label}`
      .toLowerCase()
      .includes(query.toLowerCase());
  const builtin = tools.filter(
    (tool) => tool.source === "builtin" && match(tool),
  );
  const toggle = (tool: Tool) =>
    void act(() =>
      api(`/tools/${tool.id}`, "PATCH", { enabled: !tool.enabled }),
    );
  const serverWrite = (server: MCPServer): MCPServerWrite => ({
    name: server.name,
    transport: server.transport,
    url: server.url,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    enabled: !server.enabled,
  });
  return (
    <div className="tools-settings">
      <div className="tools-toolbar">
        <div className="tool-search">
          <Search size={16} />
          <Input
            aria-label="搜索工具"
            placeholder="搜索工具或服务"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div>
          <Button variant="outline" onClick={() => setImporting(true)}>
            导入 JSON
          </Button>
          <Button onClick={() => setEditing(null)}>
            <Plus size={16} />
            添加 MCP
          </Button>
        </div>
      </div>
      {error && <ErrorNotice message={error} />}
      {notice && (
        <p role="status" className="success-notice">
          {notice}
        </p>
      )}
      {!loaded && !error && (
        <p role="status">
          <Loader2 size={16} className="spin" />
          正在读取工具…
        </p>
      )}
      {builtin.length > 0 && (
        <section className="settings-section">
          <div className="section-title">
            <h2>内置工具</h2>
            <small>{builtin.length}</small>
          </div>
          {builtin.map((tool) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              busy={busy}
              onToggle={() => toggle(tool)}
            />
          ))}
        </section>
      )}
      {servers.map((server) => {
        const items = tools.filter(
          (tool) => tool.server_id === server.id && match(tool),
        );
        if (
          query &&
          !server.name.toLowerCase().includes(query.toLowerCase()) &&
          !items.length
        )
          return null;
        return (
          <section
            className="settings-section mcp-service"
            key={server.id}
            aria-label={`MCP 服务 ${server.name}`}
          >
            <div className="mcp-service-heading">
              <Cable size={19} />
              <div>
                <h2>{server.name}</h2>
                <small>
                  {server.transport === "stdio" ? "本地 stdio" : "远程 HTTP"}
                </small>
              </div>
              <span
                className={`connection-label ${server.status === "connected" ? "ready" : ""}`}
              >
                {phases[server.status]}
              </span>
            </div>
            {server.error && <ErrorNotice message={server.error} />}
            <div className="mcp-service-actions">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const result = await api<MCPServer>(
                      `/mcp/servers/${server.id}/test`,
                      "POST",
                    );
                    if (!result.error)
                      setNotice(
                        `${server.name}：测试通过，发现 ${result.tool_count} 个工具`,
                      );
                  })
                }
              >
                <RefreshCw size={14} />
                测试 / 刷新工具
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(server)}
              >
                <Pencil size={14} />
                编辑
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void act(() =>
                    api(
                      `/mcp/servers/${server.id}`,
                      "PUT",
                      serverWrite(server),
                    ),
                  )
                }
              >
                {server.enabled ? "停用服务" : "启用服务"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={`删除服务 ${server.name}`}
                onClick={() => setDeleting(server)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
            {!server.tool_count && (
              <p className="mcp-empty">
                {server.tested_at
                  ? "服务未提供工具"
                  : "测试连接后选择要启用的工具"}
              </p>
            )}
            {items.map((tool) => (
              <ToolRow
                key={tool.id}
                tool={tool}
                busy={busy}
                onToggle={() => toggle(tool)}
              />
            ))}
          </section>
        );
      })}
      {loaded && !servers.length && !query && (
        <p className="mcp-empty">尚未添加 MCP 服务</p>
      )}
      {editing !== undefined && (
        <ServerEditor
          key={editing?.id || "new"}
          server={editing}
          onClose={() => setEditing(undefined)}
          onSaved={load}
        />
      )}
      {importing && (
        <ImportDialog
          names={servers.map((x) => x.name)}
          onClose={() => setImporting(false)}
          onSaved={load}
        />
      )}
      <ConfirmDelete
        open={Boolean(deleting)}
        title="删除 MCP 服务？"
        label={deleting?.name || ""}
        error={error || undefined}
        description="删除连接配置及凭据，已有调用记录保留。"
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          act(async () => {
            if (deleting) await api(`/mcp/servers/${deleting.id}`, "DELETE");
            setDeleting(null);
          })
        }
      />
    </div>
  );
}
