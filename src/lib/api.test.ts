import { afterEach, expect, test, vi } from "vitest";
import { fetchApi, readEvents } from "./api";
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

test("stream decodes Chinese split across network packets and ignores keepalives", async () => {
  const bytes = new TextEncoder().encode(
    ': keepalive\n\nid: 1\ndata: {"kind":"delta","data":{"text":"你好，世界"}}\n\nid: 2\ndata: {"kind":"done","data":{}}\n\n',
  );
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 2)
        controller.enqueue(bytes.slice(i, i + 2));
      controller.close();
    },
  });
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(stream))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "run-1", status: "completed" })),
    );
  vi.stubGlobal("fetch", request);
  const events: unknown[] = [];
  const result = await readEvents("run-1", (event) => events.push(event));
  expect(events).toEqual([
    { kind: "delta", data: { text: "你好，世界" } },
    { kind: "done", data: {} },
  ]);
  expect(result.status).toBe("completed");
});

test("server errors retain actionable Chinese guidance", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ detail: "请先停止正在执行的对话" }), {
          status: 409,
        }),
      ),
  );
  await expect(
    fetchApi("/conversations/test", { method: "DELETE" }),
  ).rejects.toThrow("请先停止正在执行的对话");
});

test("structured validation failures use a readable message", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: [{ loc: ["body", "due_at"], type: "value_error" }],
          }),
          { status: 422 },
        ),
      ),
  );
  await expect(
    fetchApi("/reminders", { method: "POST", body: "{}" }),
  ).rejects.toThrow("请求未完成，请检查输入并重试。");
});
