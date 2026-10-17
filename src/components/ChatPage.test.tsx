import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { readEvents } from "@/lib/api";
import { ChatPage } from "./ChatPage";
import type { Settings } from "@/lib/api";

const settings: Settings = {
  model_name: "mock-test",
  model_url: "http://127.0.0.1:8877/v1",
  model_configured: true,
  search_configured: false,
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
      default_model: "mock-test",
      key_configured: true,
      models: [
        {
          name: "mock-test",
          vision_enabled: false,
          thinking_mode: "auto",
          thinking_control: "none",
        },
      ],
    },
  ],
};

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
  readEvents: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

test("home keeps the assistant interactive without the expanded followup cards", () => {
  apiMock.mockResolvedValue([]);
  render(
    <ChatPage
      conversationId={null}
      onConversation={vi.fn()}
      goals={[]}
      reminders={[]}
      settings={settings}
      refresh={vi.fn()}
      onAction={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "今天想做点什么？" }),
  ).toBeTruthy();
  expect(screen.queryByRole("region", { name: "学习与提醒" })).toBeNull();
  const input = screen.getByLabelText("发送给XiaoXi的消息");
  fireEvent.change(input, { target: { value: "还没写完的消息" } });
  const avatar = screen.getByRole("button", { name: "和XiaoXi打个招呼" });
  fireEvent.click(avatar);
  expect(avatar.getAttribute("data-reaction")).toBe("happy");
  fireEvent.click(avatar);
  expect(avatar.getAttribute("data-reaction")).toBe("wave");
  expect((input as HTMLTextAreaElement).value).toBe("还没写完的消息");
});

test("a run completed before conversation handoff still shows its persisted answer", async () => {
  const user = {
    id: "user",
    role: "user",
    content: "请记住我的偏好",
    attachment_ids: [],
  };
  const assistant = {
    id: "assistant",
    role: "assistant",
    content: "记忆已保存，这是最终回答。",
    attachment_ids: [],
  };
  let messageReads = 0;
  apiMock.mockImplementation(async (path: string) => {
    if (path === "/conversations/fast/messages") {
      // The first read races with completion; the second sees the committed reply.
      return ++messageReads === 1 ? [user] : [user, assistant];
    }
    if (path === "/runs?conversation_id=fast")
      return [{ id: "finished", status: "completed" }];
    if (path === "/runs/finished/tools")
      return [
        {
          kind: "tool",
          data: { name: "保存记忆", result: { state: "confirmed" } },
        },
      ];
    throw new Error(`Unexpected API call: ${path}`);
  });
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <ChatPage
      conversationId="fast"
      onConversation={vi.fn()}
      goals={[]}
      reminders={[]}
      settings={{
        model_name: "mock-test",
        model_url: "http://127.0.0.1:8877/v1",
        model_configured: true,
        search_configured: false,
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
            default_model: "mock-test",
            key_configured: true,
            models: [
              {
                name: "mock-test",
                vision_enabled: false,
                thinking_mode: "auto",
                thinking_control: "none",
              },
            ],
          },
        ],
      }}
      refresh={refresh}
      onAction={vi.fn()}
    />,
  );
  expect(await screen.findByText(assistant.content)).toBeTruthy();
  expect(refresh).toHaveBeenCalledOnce();
  expect(readEvents).not.toHaveBeenCalled();
  expect(screen.getByText("已调用 1 项工具")).toBeTruthy();
});
