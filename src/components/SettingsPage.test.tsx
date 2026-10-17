import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SettingsPage, type SettingsTab } from "./SettingsPage";
import { ToolsSettings } from "./ToolsSettings";
import type { Settings, Tool } from "@/lib/api";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const settings: Settings = {
  model_url: "https://example.com/v1",
  model_name: "test-model",
  vision_enabled: false,
  timezone: "Asia/Shanghai",
  memory_mode: "auto",
  default_provider: "custom",
  provider_presets: [
    {
      id: "custom",
      label: "自定义兼容接口",
      model_url: "https://example.com/v1",
      models: [],
    },
  ],
  providers: [
    {
      id: "custom",
      provider_type: "custom",
      label: "自定义兼容接口",
      model_url: "https://example.com/v1",
      default_model: "test-model",
      key_configured: true,
      models: [
        {
          name: "test-model",
          vision_enabled: false,
          thinking_mode: "auto",
          thinking_control: "none",
        },
      ],
    },
  ],

  model_configured: true,
  search_configured: false,
};
const calculate: Tool = {
  id: "calculate",
  name: "计算器",
  description: "计算算式",
  enabled: true,
  available: true,
  source: "builtin",
  source_label: "内置工具",
  note: "内置工具",
  parameters: {},
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test("settings tabs preserve search drafts and save without overwriting models or memory mode", async () => {
  apiMock.mockImplementation(async (path: string) =>
    path === "/settings"
      ? settings
      : path === "/wechat/status"
        ? { enabled: false, bound: false, deliveries: [] }
        : [],
  );
  function Host() {
    const [tab, setTab] = React.useState<SettingsTab>("connections");
    return (
      <SettingsPage
        settings={settings}
        onSaved={vi.fn()}
        memories={[]}
        refresh={async () => {}}
        tab={tab}
        onTab={setTab}
      />
    );
  }
  render(<Host />);
  fireEvent.change(screen.getByLabelText("Tavily API 密钥"), {
    target: { value: "synthetic-search-draft" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "工具" }));
  await screen.findByRole("button", { name: "添加 MCP" });
  fireEvent.click(screen.getByRole("tab", { name: "记忆" }));
  expect(screen.getByLabelText("记忆保存方式")).toBeDefined();
  fireEvent.click(screen.getByRole("tab", { name: "连接" }));
  expect(
    (screen.getByLabelText("Tavily API 密钥") as HTMLInputElement).value,
  ).toBe("synthetic-search-draft");
  fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith(
      "/settings",
      "PUT",
      expect.objectContaining({
        providers: [],
        search_key: "synthetic-search-draft",
      }),
    ),
  );
  const body = apiMock.mock.calls.find((x) => x[0] === "/settings")![2];
  expect(body).not.toHaveProperty("memory_mode");
});

test("JSON preview makes no requests and lists no secret values", async () => {
  apiMock.mockImplementation(async (path: string) =>
    path === "/tools" ? [calculate] : [],
  );
  render(<ToolsSettings active />);
  await screen.findByText("计算器");
  fireEvent.click(screen.getByRole("button", { name: "导入 JSON" }));
  fireEvent.change(screen.getByLabelText("mcpServers JSON"), {
    target: {
      value: JSON.stringify({
        mcpServers: {
          demo: {
            url: "https://example.com/mcp",
            headers: { "X-Key": "synthetic-secret" },
          },
        },
      }),
    },
  });
  const before = apiMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "预览" }));
  expect(apiMock.mock.calls.length).toBe(before);
  expect(screen.getByLabelText("导入预览").textContent).not.toContain(
    "synthetic-secret",
  );
  fireEvent.click(screen.getByRole("button", { name: "确认导入" }));
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith(
      "/mcp/servers/import",
      "POST",
      expect.any(Object),
    ),
  );
  expect(apiMock.mock.calls.some((x) => String(x[0]).endsWith("/test"))).toBe(
    false,
  );
});

test("tool switch persists explicit disable", async () => {
  apiMock.mockImplementation(async (path: string) =>
    path === "/tools" ? [calculate] : [],
  );
  render(<ToolsSettings active />);
  const toggle = await screen.findByRole("checkbox", {
    name: "启用 内置工具 · 计算器",
  });
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith("/tools/calculate", "PATCH", {
      enabled: false,
    }),
  );
});
