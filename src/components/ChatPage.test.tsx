import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { readEvents } from "@/lib/api";
import { ChatPage } from "./ChatPage";
import type { Goal, Reminder, Settings } from "@/lib/api";

const settings: Settings = {
  model_name: "mock-test",
  model_url: "http://127.0.0.1:8877/v1",
  model_configured: true,
  search_configured: false,
  vision_enabled: false,
  timezone: "Asia/Shanghai",
  memory_mode: "auto",
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

test("empty home offers creation instead of sample progress and reminders", () => {
  apiMock.mockResolvedValue([]);
  const onAction = vi.fn();
  render(
    <ChatPage
      conversationId={null}
      onConversation={vi.fn()}
      goals={[]}
      reminders={[]}
      settings={settings}
      refresh={vi.fn()}
      onAction={onAction}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /开始一段新的学习/ }));
  expect(onAction).toHaveBeenLastCalledWith("learning", true);
  fireEvent.click(screen.getByRole("button", { name: /安排一个小提醒/ }));
  expect(onAction).toHaveBeenLastCalledWith("reminders", true);
  expect(screen.queryByText("Python 基础入门")).toBeNull();
});

test("home continues a persisted goal and shows the earliest active reminder", () => {
  apiMock.mockResolvedValue([]);
  const stamp = {
    created_at: "2030-01-01T00:00:00Z",
    updated_at: "2030-01-01T00:00:00Z",
  };
  const goal: Goal = {
    ...stamp,
    id: "my-goal",
    title: "我的真实学习目标",
    objective: "自己动手练习",
    foundation: "",
    status: "active",
    course_version: 1,
    current_node_id: "node",
    nodes: [
      {
        ...stamp,
        id: "node",
        goal_id: "my-goal",
        ordinal: 0,
        module: "基础",
        title: "已有知识点",
        objective: "理解基础",
        prerequisites: [],
        exercise_type: "question",
        criteria: "能解释",
        status: "passed",
        review_at: null,
      },
    ],
  };
  const reminder: Reminder = {
    ...stamp,
    id: "later",
    title: "较晚的提醒",
    body: "",
    due_at: "2030-01-02T12:00:00Z",
    timezone: "Asia/Shanghai",
    recurrence: "none",
    status: "active",
  };
  const onAction = vi.fn();
  render(
    <ChatPage
      conversationId={null}
      onConversation={vi.fn()}
      goals={[goal]}
      reminders={[
        reminder,
        {
          ...reminder,
          id: "cancelled",
          title: "已取消的提醒",
          due_at: "2030-01-01T01:00:00Z",
          status: "cancelled",
        },
        {
          ...reminder,
          id: "first",
          title: "最早的有效提醒",
          due_at: "2030-01-02T01:00:00Z",
        },
      ]}
      settings={settings}
      refresh={vi.fn()}
      onAction={onAction}
    />,
  );
  expect(screen.getByText("1 / 1 个知识点通过练习")).toBeTruthy();
  expect(screen.getByText("最早的有效提醒")).toBeTruthy();
  expect(screen.queryByText("已取消的提醒")).toBeNull();
  expect(screen.queryByText("较晚的提醒")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /我的真实学习目标/ }));
  expect(localStorage.getItem("bai-current-goal")).toBe(goal.id);
  expect(onAction).toHaveBeenLastCalledWith("learning", false);
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
