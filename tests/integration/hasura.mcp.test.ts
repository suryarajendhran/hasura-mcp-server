import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import path from "node:path";

const HASURA_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT ?? "http://localhost:8081/v1/graphql";
const HASURA_SECRET = process.env.HASURA_GRAPHQL_SECRET ?? "secret";
const HASURA_HEALTH = process.env.HASURA_HEALTH_ENDPOINT ?? "http://localhost:8081/healthz";

async function waitForHasura(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(HASURA_HEALTH);
      if (res.ok) return;
    } catch {
      // ignore and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Hasura did not become healthy in time.");
}

describe("hasura mcp integration", () => {
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  beforeAll(async () => {
    await waitForHasura();

    const cliPath = path.resolve(process.cwd(), "dist/cli.js");
    if (!existsSync(cliPath)) {
      throw new Error("dist/cli.js not found. Run `pnpm run build` before integration tests.");
    }

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath],
      env: {
        HASURA_GRAPHQL_ENDPOINT: HASURA_ENDPOINT,
        HASURA_GRAPHQL_SECRET: HASURA_SECRET
      },
      stderr: "pipe"
    });

    client = new Client({ name: "hasura-mcp-tests", version: "0.1.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    await transport?.close();
  });

  it("lists tools", async () => {
    const result = await client?.listTools();
    const names = result?.tools.map((tool) => tool.name) ?? [];
    expect(names).toContain("list_tables");
    expect(names).toContain("preview_table_data");
  });

  it("lists tables and previews data", async () => {
    const list = await client?.callTool({ name: "list_tables", arguments: {} });
    const text = list?.content?.[0]?.type === "text" ? list?.content?.[0]?.text : "";
    const parsed = text ? JSON.parse(text) : { tables: [] };
    expect(parsed.tables).toEqual(expect.arrayContaining(["authors", "articles"]));

    const preview = await client?.callTool({
      name: "preview_table_data",
      arguments: { tableName: "authors", limit: 5 }
    });
    const previewText = preview?.content?.[0]?.type === "text" ? preview?.content?.[0]?.text : "";
    const previewData = previewText ? JSON.parse(previewText) : {};
    expect(previewData).toHaveProperty("authors");
    expect(previewData.authors.length).toBeGreaterThan(0);
  });

  it("runs graphql query", async () => {
    const query = "query { authors { id name } }";
    const result = await client?.callTool({
      name: "run_graphql_query",
      arguments: { query }
    });
    const text = result?.content?.[0]?.type === "text" ? result?.content?.[0]?.text : "";
    const parsed = text ? JSON.parse(text) : {};
    expect(parsed).toHaveProperty("authors");
  });

  it("reports mutation capability in health check", async () => {
    const result = await client?.callTool({ name: "health_check", arguments: {} });
    const text = result?.content?.[0]?.type === "text" ? result?.content?.[0]?.text : "";
    const parsed = text ? JSON.parse(text) : {};
    expect(typeof parsed.hasMutationFields).toBe("boolean");
    if (parsed.hasMutationFields) {
      expect(parsed.warnings?.[0]).toMatch(/write access/i);
    }
  });
});
