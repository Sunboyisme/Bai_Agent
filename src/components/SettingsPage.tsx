import { useEffect, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModelConnections } from "./ModelConnections";
import { api, type Settings, type Memory } from "@/lib/api";
import { ErrorNotice } from "./common";
import { WechatSection } from "./WechatSection";
import { ToolsSettings } from "./ToolsSettings";
import { MemoryPage } from "./MemoryPage";

function ConnectionSettings({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (value: Settings) => void;
}) {
  const [searchKey, setSearchKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clearSearch, setClearSearch] = useState(false);
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await api<Settings>("/settings", "PUT", {
        providers: [],
        search_key: clearSearch ? "" : searchKey || null,
        timezone: settings.timezone,
      });
      onSaved(value);
      setSearchKey("");
      setClearSearch(false);
      setNotice("设置已保存");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {error && <ErrorNotice message={error} />}
      {notice && (
        <div className="success-notice" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      <ModelConnections settings={settings} onSaved={onSaved} />
      <section className="settings-section">
        <div className="section-title">
          <Search size={20} />
          <div>
            <h2>联网查资料</h2>
            <p>配置 Tavily 后，Agent 会自动搜索资料、读取网页。</p>
          </div>
          <span
            className={`connection-label ${settings.search_configured ? "ready" : ""}`}
          >
            {settings.search_configured ? "已配置" : "待配置"}
          </span>
        </div>
        <div className="form-field">
          <Label htmlFor="search-key">Tavily API 密钥</Label>
          <Input
            id="search-key"
            type="password"
            autoComplete="new-password"
            value={searchKey}
            onChange={(e) => {
              setSearchKey(e.target.value);
              setClearSearch(false);
            }}
            placeholder={
              settings.search_configured ? "已保存；留空保持原密钥" : "tvly-…"
            }
          />
          <p className="field-hint">
            天气、计算器、日期与时区、单位换算已内置，无需这项密钥。
          </p>
          {settings.search_configured && (
            <button
              className="text-button danger"
              onClick={() => {
                setClearSearch(true);
                setSearchKey("");
              }}
            >
              {clearSearch ? "保存后清除密钥" : "清除已保存的密钥"}
            </button>
          )}
        </div>
      </section>
      <WechatSection />
      <div className="settings-footer">
        <div>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 size={16} className="spin" /> : null}保存设置
          </Button>
        </div>
      </div>
    </div>
  );
}

export type SettingsTab = "connections" | "tools" | "memories";
export function SettingsPage({
  settings,
  onSaved,
  memories,
  refresh,
  tab,
  onTab,
  createRequested,
}: {
  settings: Settings;
  onSaved: (value: Settings) => void;
  memories: Memory[];
  refresh: () => Promise<void>;
  tab: SettingsTab;
  onTab: (value: SettingsTab) => void;
  createRequested?: number;
}) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (tab === "memories")
      void refresh().catch((error: Error) => setError(error.message));
  }, [tab, refresh]);
  return (
    <div className="settings-page page-content">
      <div className="page-heading">
        <h1>设置</h1>
      </div>
      {error && <ErrorNotice message={error} />}
      <div className="settings-tabs" role="tablist" aria-label="设置分类">
        {(
          [
            ["connections", "连接"],
            ["tools", "工具"],
            ["memories", "记忆"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            id={`settings-tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`settings-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const tabs: SettingsTab[] = [
                  "connections",
                  "tools",
                  "memories",
                ];
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (tabs.indexOf(tab) +
                          (event.key === "ArrowRight" ? 1 : 2)) %
                        3;
                onTab(tabs[next]);
                document.getElementById(`settings-tab-${tabs[next]}`)?.focus();
              }
            }}
            onClick={() => onTab(value)}
          >
            {label}
            {value === "memories" &&
              memories.some((x) => x.state === "candidate") && (
                <span className="candidate-dot" />
              )}
          </button>
        ))}
      </div>
      <div
        id="settings-panel-connections"
        role="tabpanel"
        aria-labelledby="settings-tab-connections"
        hidden={tab !== "connections"}
      >
        <ConnectionSettings settings={settings} onSaved={onSaved} />
      </div>
      <div
        id="settings-panel-tools"
        role="tabpanel"
        aria-labelledby="settings-tab-tools"
        hidden={tab !== "tools"}
      >
        <ToolsSettings active={tab === "tools"} />
      </div>
      <div
        id="settings-panel-memories"
        role="tabpanel"
        aria-labelledby="settings-tab-memories"
        hidden={tab !== "memories"}
      >
        <MemoryPage
          memories={memories}
          memoryMode={settings.memory_mode}
          refresh={refresh}
          createRequested={createRequested}
          embedded
        />
      </div>
    </div>
  );
}
