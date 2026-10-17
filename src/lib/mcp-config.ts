import type { MCPServerWrite } from "./api";

/** Parse and preview locally: no credential-bearing request or process start. */
export function parseMCPConfig(text: string): MCPServerWrite[] {
  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式无效");
  }
  const object = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === "object" && !Array.isArray(v);
  if (
    !object(config) ||
    Object.keys(config).some((k) => k !== "mcpServers") ||
    !object(config.mcpServers)
  )
    throw new Error("请提供包含 mcpServers 的配置");
  const entries = Object.entries(config.mcpServers);
  if (!entries.length || entries.length > 50)
    throw new Error("一次导入 1–50 个服务");
  const allowed = new Set([
    "command",
    "args",
    "cwd",
    "env",
    "url",
    "headers",
    "type",
    "transport",
  ]);
  return entries.map(([name, value]) => {
    if (!name.trim() || name.length > 100 || !object(value))
      throw new Error("服务名称或配置无效");
    if (Object.keys(value).some((k) => !allowed.has(k)))
      throw new Error(`${name} 包含不支持的字段`);
    if (value.type && value.transport)
      throw new Error(`${name} 请仅保留 type 或 transport`);
    const type = value.transport || value.type;
    if (
      type &&
      !["stdio", "http", "streamable_http", "streamable-http"].includes(
        String(type),
      )
    )
      throw new Error(`${name} 仅支持 stdio 和 Streamable HTTP`);
    const transport =
      type === "stdio" || (!type && value.command !== undefined)
        ? "stdio"
        : "streamable_http";
    for (const key of ["command", "url", "cwd"])
      if (value[key] !== undefined && typeof value[key] !== "string")
        throw new Error(`${name} 的 ${key} 必须是字符串`);
    if (
      value.args !== undefined &&
      (!Array.isArray(value.args) ||
        value.args.some((v) => typeof v !== "string"))
    )
      throw new Error(`${name} 的 args 必须是字符串数组`);
    for (const key of ["env", "headers"])
      if (
        value[key] !== undefined &&
        (!object(value[key]) ||
          Object.values(value[key]).some((v) => typeof v !== "string"))
      )
        throw new Error(`${name} 的 ${key} 必须是键值对象`);
    if (transport === "stdio" && (!value.command || value.url || value.headers))
      throw new Error(`${name} 的本地命令配置不完整或混用了远程配置`);
    if (transport === "streamable_http") {
      let url: URL;
      try {
        url = new URL(String(value.url));
      } catch {
        throw new Error(`${name} 的 URL 无效`);
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        value.command ||
        value.args ||
        value.cwd ||
        value.env
      )
        throw new Error(`${name} 的远程配置无效，认证请使用请求头`);
    }
    const { type: _type, transport: _transport, ...data } = value;
    return {
      ...data,
      name: name.trim(),
      transport,
      enabled: false,
    } as MCPServerWrite;
  });
}
