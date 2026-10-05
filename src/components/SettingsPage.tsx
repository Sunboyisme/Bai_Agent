import { useState } from "react";
import {
  Cable,
  Check,
  Eye,
  KeyRound,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api, type Settings } from "@/lib/api";
import { ErrorNotice } from "./common";

export function SettingsPage({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (value: Settings) => void;
}) {
  const [url, setUrl] = useState(settings.model_url);
  const [model, setModel] = useState(settings.model_name);
  const [key, setKey] = useState("");
  const [searchKey, setSearchKey] = useState("");
  const [vision, setVision] = useState(settings.vision_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clearModel, setClearModel] = useState(false);
  const [clearSearch, setClearSearch] = useState(false);
  async function save(test = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await api<Settings>("/settings", "PUT", {
        model_url: url,
        model_name: model,
        model_key: clearModel ? "" : key || null,
        search_key: clearSearch ? "" : searchKey || null,
        vision_enabled: vision,
        timezone: "Asia/Shanghai",
      });
      onSaved(value);
      setKey("");
      setSearchKey("");
      setClearModel(false);
      setClearSearch(false);
      if (test) {
        const result = await api<{ message: string }>("/settings/test", "POST");
        setNotice(result.message);
      } else setNotice("设置已保存");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-page page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">让 Bai 连接到你的工具</p>
          <h1>连接与设置</h1>
          <p>配置一次，之后就可以开始对话和学习。</p>
        </div>
      </div>
      {error && <ErrorNotice message={error} />}
      {notice && (
        <div className="success-notice">
          <Check size={17} />
          {notice}
        </div>
      )}
      <section className="settings-section">
        <div className="section-title">
          <Cable size={20} />
          <div>
            <h2>模型连接</h2>
            <p>支持 OpenAI 兼容接口，使用你自己的服务商与模型。</p>
          </div>
          <span
            className={`connection-label ${settings.model_configured ? "ready" : ""}`}
          >
            {settings.model_configured ? "已配置" : "待配置"}
          </span>
        </div>
        <div className="form-field">
          <Label htmlFor="model-url">接口地址</Label>
          <Input
            id="model-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://你的服务商/v1"
          />
        </div>
        <div className="form-field">
          <Label htmlFor="model-name">模型名称</Label>
          <Input
            id="model-name"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="填写服务商提供的模型名"
          />
        </div>
        <div className="form-field">
          <Label htmlFor="model-key">API 密钥</Label>
          <Input
            id="model-key"
            type="password"
            autoComplete="new-password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setClearModel(false);
            }}
            placeholder={
              settings.model_configured
                ? "已保存；留空保持原密钥"
                : "输入 API 密钥"
            }
          />
          <p className="field-hint">
            <KeyRound size={13} />
            密钥保存在系统凭据管理中，不会显示在对话里。
          </p>
          {settings.model_configured && (
            <button
              className="text-button danger"
              onClick={() => {
                setClearModel(true);
                setKey("");
              }}
            >
              {clearModel ? "保存后清除密钥" : "清除已保存的密钥"}
            </button>
          )}
        </div>
        <label className="checkbox-row">
          <Checkbox
            checked={vision}
            onCheckedChange={(value) => setVision(value === true)}
          />
          <div>
            <span>这个模型支持图片输入</span>
            <p>请根据服务商说明开启；不支持时仍可使用文字交流。</p>
          </div>
          <Eye size={18} />
        </label>
      </section>
      <section className="settings-section">
        <div className="section-title">
          <Search size={20} />
          <div>
            <h2>联网查资料</h2>
            <p>接入 Tavily，获取搜索结果与网页正文。</p>
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
      <div className="settings-footer">
        <span>
          <ShieldCheck size={16} />
          当前数据保存在这台电脑 · 时区：上海
        </span>
        <div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void save(true)}
          >
            保存并测试模型
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 size={16} className="spin" /> : null}保存设置
          </Button>
        </div>
      </div>
    </div>
  );
}
