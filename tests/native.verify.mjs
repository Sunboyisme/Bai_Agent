// Run only against an isolated review profile and a dev WebView2 CDP port.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const data = resolve(process.env.BAI_DATA_DIR || ".local-data/review");
const token = readFileSync(resolve(data, "auth-token"), "utf8").trim();
async function api(path, body) {
  const res = await fetch("http://127.0.0.1:8766/api/v1" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(res.status, 200);
  return res.json();
}
const browser = await chromium.connectOverCDP("http://127.0.0.1:9227");
const main = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((page) => !page.url().includes("view=reminder"));
assert.ok(main);
main.setDefaultTimeout(10000);
await main.reload();
await main.getByRole("button", { name: "连接与设置", exact: true }).waitFor();
assert.equal(
  await main.evaluate(() => Boolean(window.__TAURI_INTERNALS__)),
  true,
);
const errors = [];
main.on("pageerror", (error) => errors.push(error.message));
await main.getByRole("button", { name: "学习", exact: true }).click();
if (await main.locator(".goal-card").count())
  await main.locator(".goal-card").filter({ hasText: "学习前端" }).click();
await main
  .getByRole("heading", { name: "学习前端 · 认识基础", exact: true })
  .waitFor();
assert.ok(await main.getByText("这次练习通过了", { exact: false }).isVisible());
await main.screenshot({ path: resolve(data, "native-learning.png") });
await main.evaluate(async () => {
  const { getCurrentWindow } =
    await import("/node_modules/.vite/deps/@tauri-apps_api_window.js");
  await getCurrentWindow().close();
});
await api("/reminders", {
  title: "桌面测试：窗口关闭后仍提醒",
  body: "这是一条隔离测试提醒。",
  due_at: new Date(Date.now() + 1500).toISOString(),
  timezone: "Asia/Shanghai",
  recurrence: "none",
});
let popup;
for (let i = 0; i < 60; i++) {
  popup = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((page) => page.url().includes("view=reminder"));
  if (popup) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.ok(
  popup,
  "desktop reminder window must open while main window is hidden",
);
await popup.getByText("桌面测试：窗口关闭后仍提醒", { exact: true }).waitFor();
await popup.screenshot({ path: resolve(data, "native-reminder.png") });
await popup.getByRole("button", { name: "知道了", exact: true }).click();
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(
  (await api("/notifications")).find(
    (n) => n.title === "桌面测试：窗口关闭后仍提醒",
  ).status,
  "read",
);
assert.deepEqual(errors, []);
console.log(
  "PASS: native IPC, saved learning feedback, close-to-tray, reminder popup, notification acknowledgement",
);
// End the CDP connection without sending Browser.close to the user's desktop app.
process.exit(0);
