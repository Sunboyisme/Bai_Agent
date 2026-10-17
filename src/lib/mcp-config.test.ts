import { expect, test } from "vitest";
import { parseMCPConfig } from "./mcp-config";

test("imports common stdio and HTTP configs without enabling execution", () => {
  const parsed = parseMCPConfig(
    JSON.stringify({
      mcpServers: {
        files: {
          command: "node",
          args: ["server.js"],
          env: { TOKEN: "test-secret" },
        },
        remote: {
          type: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer test-secret" },
        },
      },
    }),
  );
  expect(parsed.map((x) => x.transport)).toEqual(["stdio", "streamable_http"]);
  expect(parsed.every((x) => !x.enabled)).toBe(true);
  expect(parsed[0].env).toEqual({ TOKEN: "test-secret" });
});

test.each([
  "not json",
  '{"mcpServers":{}}',
  '{"mcpServers":{"bad":{"type":"sse","url":"https://example.com"}}}',
  '{"mcpServers":{"bad":{"command":"node","args":"server.js"}}}',
  '{"mcpServers":{"bad":{"url":"https://user:secret@example.com/mcp"}}}',
  '{"mcpServers":{"bad":{"url":"https://example.com/mcp?key=secret"}}}',
  '{"mcpServers":{"bad":{"command":"node","enabled":true}}}',
  '{"mcpServers":{"bad":{"url":"https://example.com/mcp","headers":{"X-Key":12}}}}',
])("rejects malformed or unsupported import: %s", (input) =>
  expect(() => parseMCPConfig(input)).toThrow(),
);
