// Isolated QA only: needs the distinct com.qinbai.baiagent.mcpqa instance.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(".local-data/mcp-review");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9294");
const page = browser
  .contexts()
  .flatMap((x) => x.pages())
  .find((x) => x.url().startsWith("http://127.0.0.1:5294"));
assert.ok(page, "Only connect to the isolated QA window");
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const connection = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("backend_config"),
);
assert.equal(connection.url, "http://127.0.0.1:8794/api/v1");
assert.equal(
  connection.token,
  readFileSync(resolve(root, "runtime/auth-token"), "utf8").trim(),
);
async function api(path, method = "GET", body) {
  const response = await fetch(connection.url + path, {
    method,
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
}
await page.reload();
await page.getByRole("button", { name: "连接与设置", exact: true }).click();
await page.getByRole("tab", { name: "工具", exact: true }).click();
for (const server of await api("/mcp/servers"))
  if (server.name === "原生验证 MCP")
    await api(`/mcp/servers/${server.id}`, "DELETE");
await page.getByRole("button", { name: "添加 MCP", exact: true }).click();
await page.getByLabel("名称", { exact: true }).fill("原生验证 MCP");
await page
  .getByLabel("服务地址", { exact: true })
  .fill("http://127.0.0.1:8895/mcp");
await page.getByRole("button", { name: "添加请求头", exact: true }).click();
await page.getByLabel("请求头名称 1", { exact: true }).fill("X-Test-Key");
await page
  .getByLabel("请求头值 1", { exact: true })
  .fill("synthetic-mcp-secret");
await page.getByRole("button", { name: "保存配置", exact: true }).click();
const section = page.getByRole("region", { name: "MCP 服务 原生验证 MCP" });
await section.getByRole("button", { name: "测试 / 刷新工具" }).click();
const echo = section.getByRole("checkbox", {
  name: "启用 原生验证 MCP · echo",
  exact: true,
});
await echo.waitFor();
await echo.click();
await page.waitForFunction(
  () =>
    document
      .querySelector('[aria-label="启用 原生验证 MCP · echo"]')
      ?.getAttribute("aria-checked") === "true",
);
await section.getByRole("button", { name: "启用服务", exact: true }).click();
await page.waitForFunction(() =>
  [...document.querySelectorAll(".mcp-service")].some(
    (x) =>
      x.textContent.includes("原生验证 MCP") &&
      x.textContent.includes("已连接"),
  ),
);
await page.getByLabel("搜索工具", { exact: true }).fill("原生验证 MCP");
await page.locator(".page-body").evaluate((x) => {
  x.scrollTop = 0;
});
await page.screenshot({ path: resolve(root, "native-tools.png") });
await page.reload();
await page.getByRole("button", { name: "连接与设置", exact: true }).click();
await page.getByRole("tab", { name: "工具", exact: true }).click();
assert.equal(await echo.getAttribute("aria-checked"), "true");
await page.getByRole("tab", { name: "记忆", exact: true }).click();
await page.getByRole("button", { name: "添加记忆", exact: true }).click();
await page
  .getByRole("dialog")
  .getByLabel("想记住什么", { exact: true })
  .fill("原生 MCP 验证记忆");
await page.getByRole("button", { name: "保存记忆", exact: true }).click();
await page.getByText("原生 MCP 验证记忆", { exact: true }).waitFor();
await page.screenshot({ path: resolve(root, "native-memory.png") });
const server = (await api("/mcp/servers")).find(
  (x) => x.name === "原生验证 MCP",
);
assert.equal(server.status, "connected");
assert.deepEqual(server.headers, { "X-Test-Key": true });
for (const memory of await api("/memories"))
  if (memory.content === "原生 MCP 验证记忆")
    await api(`/memories/${memory.id}`, "DELETE");
await api(`/mcp/servers/${server.id}`, "DELETE");
assert.deepEqual(errors, []);
writeFileSync(
  resolve(root, "native-verification.json"),
  JSON.stringify(
    {
      native: true,
      settingsTabs: true,
      formSaved: true,
      httpDiscovered: server.tool_count,
      toolSelectionPersisted: true,
      memoryCreateRead: true,
      errors,
      screenshots: ["native-tools.png", "native-memory.png"],
    },
    null,
    2,
  ),
);
console.log("Native MCP/settings/memory verification passed");
await page
  .evaluate(() => window.__TAURI_INTERNALS__.invoke("quit_app"))
  .catch(() => {});
await browser.close();
