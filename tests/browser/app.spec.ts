import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  (page as any).testErrors = errors;
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "连接与设置", exact: true }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) =>
  expect((page as any).testErrors).toEqual([]),
);

test("small window keeps Chinese title and main actions accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1262, height: 624 });
  const box = await page.locator(".welcome h1").boundingBox();
  expect(box?.y).toBeGreaterThanOrEqual(56);
  const composer = page.getByLabel("发送给 Bai 的消息");
  await composer.fill("检查换行");
  await composer.press("Shift+Enter");
  await expect(composer).toHaveValue("检查换行\n");
  const model = page.getByRole("button", { name: "选择模型", exact: true });
  await model.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(model).toBeFocused();
  await page.getByRole("button", { name: "查看 Agent 工具箱" }).click();
  await page.getByRole("menuitem", { name: /查询天气/ }).click();
  await expect(composer).toHaveValue(/广州/);
  await expect(composer).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("avatar toggles sidebar and preserves draft, navigation and saved preference", async ({
  page,
}) => {
  const draft = page.getByLabel("发送给 Bai 的消息");
  await draft.fill("先留在这里，等我想清楚再发送");
  const collapse = page.getByRole("button", { name: "收起侧栏", exact: true });
  await expect(page.locator(".sidebar-toggle")).toHaveCount(0);
  await expect(collapse).toHaveClass("brand-avatar");
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(
    page.getByRole("button", { name: "展开侧栏", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(draft).toHaveValue("先留在这里，等我想清楚再发送");
  const rail = await page.locator(".sidebar").boundingBox();
  expect(rail?.width).toBeLessThan(100);
  await page.getByRole("button", { name: "记忆", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "记忆", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "展开侧栏", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "收起侧栏", exact: true }),
  ).toBeVisible();
  expect((await page.locator(".sidebar").boundingBox())?.width).toBeGreaterThan(
    170,
  );
  await expect(
    page.locator(".welcome-actions,.profile,.local-indicator"),
  ).toHaveCount(0);
  await expect(page.getByText("随时接着往前走", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".app-topbar")).not.toContainText("我的空间");
  await expect(
    page.getByText("Enter 发送 · Shift + Enter 换行", { exact: true }),
  ).toHaveCount(0);
});

test("toolbox shows built-ins, search setup and fills prompts in the same chat", async ({
  page,
}) => {
  const toolbox = page.getByRole("button", { name: "查看 Agent 工具箱" });
  await toolbox.click();
  await expect(page.getByRole("menuitem", { name: /查询天气/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /搜索资料/ })).toContainText(
    "需配置 Tavily 密钥",
  );
  await page.getByRole("menuitem", { name: /计算器/ }).click();
  await expect(page.getByLabel("发送给 Bai 的消息")).toHaveValue(
    "帮我计算：(199 + 89) * 0.85",
  );
  await expect(page.getByLabel("发送给 Bai 的消息")).toBeFocused();
  await toolbox.click();
  await page.keyboard.press("Escape");
  await expect(toolbox).toBeFocused();
});

test("configure own compatible API and test connection", async ({ page }) => {
  await page.getByRole("button", { name: "连接与设置", exact: true }).click();
  await page
    .getByLabel("接口地址", { exact: true })
    .fill("http://127.0.0.1:8877/v1");
  await page.getByLabel("模型名称", { exact: true }).fill("mock-test");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.getByText("设置已保存", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "保存并测试模型", exact: true })
    .click();
  await expect(
    page.getByText("模型接口连接成功", { exact: true }),
  ).toBeVisible();
});

test("new conversation stream saves final answer and tool memory", async ({
  page,
}) => {
  await page.getByLabel("发送给 Bai 的消息").fill("请记住我喜欢先看例子");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page
      .locator(".message.assistant")
      .getByText("工具已经执行，结果已保存。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "记忆", exact: true }).click();
  await expect(
    page.getByText("我喜欢先看例子再学习理论", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "记忆", exact: true }).click();
  await expect(
    page.getByText("我喜欢先看例子再学习理论", { exact: true }),
  ).toBeVisible();
});

test("agent calls multiple utility tools and restores results after reload", async ({
  page,
}) => {
  await page
    .getByLabel("发送给 Bai 的消息")
    .fill("帮我计算并换算单位，再查一下日期。");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByText("已调用 3 项工具")).toBeVisible();
  await page.getByRole("button", { name: /已调用 3 项工具/ }).click();
  await expect(page.getByText("结果：244.80", { exact: true })).toBeVisible();
  await expect(
    page.getByText("结果：8.04672 km", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(".conversation-link > button:first-child")
    .filter({ hasText: "帮我计算并换算单位" })
    .click();
  await expect(
    page.getByRole("button", { name: /已调用 3 项工具/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /已调用 3 项工具/ }).click();
  await expect(page.getByText("结果：244.80", { exact: true })).toBeVisible();
});

test("course, teaching, feedback, next node and reload progress", async ({
  page,
}) => {
  await page.getByRole("button", { name: "学习", exact: true }).click();
  await page.getByRole("button", { name: "新的学习目标", exact: true }).click();
  await page.getByLabel("学习主题").fill("学习前端");
  await page.getByLabel("你希望学到什么程度").fill("独立做一个网页");
  await page.getByRole("button", { name: "建立学习路线", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "学习前端 · 认识基础", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "开始这个知识点", exact: true })
    .click();
  await expect(page.getByLabel("练习回答")).toBeVisible();
  await page
    .getByLabel("练习回答")
    .fill("概念描述事物，例如前端页面中的结构。");
  await page.getByRole("button", { name: "提交练习", exact: true }).click();
  await expect(
    page.getByText("这次练习通过了", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "学习", exact: true }).click();
  await expect(
    page.getByText("这次练习通过了", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "下一个知识点", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "学习前端 · 应用方法", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local-data/review/learning-browser.png" });
});

test("manual memories can be created, edited and deleted", async ({ page }) => {
  await page.getByRole("button", { name: "记忆", exact: true }).click();
  await page.getByRole("button", { name: "添加记忆", exact: true }).click();
  await page.getByLabel("想记住什么").fill("浏览器测试：正在写个人 Agent");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  const card = page
    .locator(".memory-card")
    .filter({ hasText: "浏览器测试：正在写个人 Agent" });
  await card.getByRole("button", { name: "编辑记忆", exact: true }).click();
  await page.getByLabel("想记住什么").fill("浏览器测试：记忆已修改");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  const changed = page
    .locator(".memory-card")
    .filter({ hasText: "浏览器测试：记忆已修改" });
  await changed.getByRole("button", { name: "删除记忆", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "删除记忆", exact: true })
    .click();
  await expect(
    page.getByText("浏览器测试：记忆已修改", { exact: true }),
  ).toHaveCount(0);
});

test("manual reminder can be saved, edited and completed", async ({ page }) => {
  await page.getByRole("button", { name: "提醒", exact: true }).click();
  await page.getByRole("button", { name: "新建提醒", exact: true }).click();
  await page.getByLabel("提醒我做什么").fill("浏览器测试：明天学习");
  await page
    .getByLabel("时间（北京时间）", { exact: true })
    .fill("2030-01-01T20:00");
  await page.getByRole("button", { name: "保存提醒", exact: true }).click();
  const row = page
    .locator(".reminder-row")
    .filter({ hasText: "浏览器测试：明天学习" });
  await expect(row).toBeVisible();
  await row
    .getByRole("button", { name: "编辑 浏览器测试：明天学习", exact: true })
    .click();
  await page.getByLabel("提醒我做什么").fill("浏览器测试：已调整学习时间");
  await page.getByRole("button", { name: "保存提醒", exact: true }).click();
  const changed = page
    .locator(".reminder-row")
    .filter({ hasText: "浏览器测试：已调整学习时间" });
  await changed
    .getByRole("button", {
      name: "完成 浏览器测试：已调整学习时间",
      exact: true,
    })
    .click();
  await expect(changed).toHaveCount(0);
});
