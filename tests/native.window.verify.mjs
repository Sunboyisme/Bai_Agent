// Same-source QA build changes only the app identifier to coexist with the installed app.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(".local-data/release-qa-0.1.2");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9296");
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((entry) => entry.url().startsWith("http://tauri.localhost"));
assert.ok(page, "Expected the isolated release WebView");
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.getByRole("button", { name: "连接与设置", exact: true }).waitFor();
const connection = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("backend_config"),
);
assert.equal(
  connection.token,
  readFileSync(resolve(root, "runtime/auth-token"), "utf8").trim(),
);
const health = await fetch(connection.url + "/health", {
  headers: { Authorization: `Bearer ${connection.token}` },
}).then((response) => response.json());
assert.equal(health.version, "0.1.2");
assert.equal(await page.title(), "XiaoXi · 个人助手");
await page.getByRole("button", { name: "最小化", exact: true }).waitFor();

async function windowValue(command) {
  return page.evaluate(
    (name) =>
      window.__TAURI_INTERNALS__.invoke(`plugin:window|${name}`, {
        label: "main",
      }),
    command,
  );
}
async function waitWindowValue(command, expected) {
  await page.waitForFunction(
    async ({ name, value }) =>
      (await window.__TAURI_INTERNALS__.invoke(`plugin:window|${name}`, {
        label: "main",
      })) === value,
    { name: command, value: expected },
  );
}
function reopen() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("BAI_") && !key.startsWith("WEBVIEW2_"),
    ),
  );
  environment.BAI_DATA_DIR = resolve(root, "runtime");
  const result = spawnSync(resolve(root, "extracted/bai-agent-qa.exe"), [], {
    env: environment,
    windowsHide: true,
    timeout: 15000,
  });
  assert.equal(result.status, 0);
}

const collapsed = page.getByRole("button", { name: "展开侧栏", exact: true });
if (await collapsed.isVisible()) await collapsed.click();
const initialToggle = await page
  .locator(".window-titlebar .sidebar-toggle")
  .boundingBox();
assert.ok(initialToggle.y < 40 && initialToggle.x < 130);
await page.getByLabel("发送给XiaoXi的消息").fill("原生窗口草稿验证");
await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
assert.equal(
  await page.getByLabel("发送给XiaoXi的消息").inputValue(),
  "原生窗口草稿验证",
);
assert.deepEqual(
  await page.locator(".window-titlebar .sidebar-toggle").boundingBox(),
  initialToggle,
);
await page.getByRole("button", { name: "展开侧栏", exact: true }).click();

const bottomFits = await page.evaluate(() => {
  const footer = document
    .querySelector(".sidebar-footer")
    .getBoundingClientRect();
  const composer = document.querySelector(".composer").getBoundingClientRect();
  return (
    footer.bottom <= innerHeight &&
    composer.bottom <= innerHeight &&
    document.documentElement.scrollHeight <= innerHeight
  );
});
assert.ok(bottomFits);
await page.screenshot({ path: resolve(root, "native-default.png") });
await page.getByRole("button", { name: "最大化", exact: true }).click();
await page.getByRole("button", { name: "还原窗口", exact: true }).waitFor();
assert.equal(await windowValue("is_maximized"), true);
await page.getByRole("button", { name: "还原窗口", exact: true }).click();
await page.getByRole("button", { name: "最大化", exact: true }).waitFor();
assert.equal(await windowValue("is_maximized"), false);

await page.getByRole("button", { name: "最小化", exact: true }).click();
await waitWindowValue("is_minimized", true);
assert.equal(await windowValue("is_minimized"), true);
reopen();
await waitWindowValue("is_minimized", false);
assert.equal(await windowValue("is_minimized"), false);
await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
await waitWindowValue("is_visible", false);
assert.equal(await windowValue("is_visible"), false);
reopen();
await waitWindowValue("is_visible", true);
assert.equal(await windowValue("is_visible"), true);
await page.getByRole("button", { name: "连接与设置", exact: true }).click();
await page.getByRole("tab", { name: "工具", exact: true }).click();
await page.getByRole("heading", { name: "内置工具", exact: true }).waitFor();
await page.getByRole("tab", { name: "记忆", exact: true }).click();
await page.getByRole("heading", { name: "记忆", exact: true }).waitFor();
await page.getByRole("button", { name: "关于这个空间", exact: true }).click();
assert.ok(
  (await page.getByRole("dialog").innerText()).includes("XiaoXi · 0.1.2"),
);
assert.deepEqual(errors, []);
writeFileSync(
  resolve(root, "native-verification.json"),
  JSON.stringify(
    {
      version: health.version,
      sameSourceIsolatedBuild: true,
      systemPythonOnPath: false,
      bottomFits,
      titlebarToggleFixed: true,
      draftPreserved: true,
      minimizeRestore: true,
      maximizeRestore: true,
      closeHidesToTray: true,
      singleInstanceReopen: true,
      settingsNavigation: true,
      errors,
    },
    null,
    2,
  ),
);
await page
  .evaluate(() => window.__TAURI_INTERNALS__.invoke("quit_app"))
  .catch(() => {});
await browser.close();
console.log("Isolated native window checks passed.");
