import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "./db/index.js";
import { insertBehavior } from "./repo/behaviors.js";
import { insertRule } from "./repo/rules.js";
import { createServer } from "./server.js";

async function connectedClient() {
  const db = openDb(":memory:");
  const bid = insertBehavior(db, {
    name: "Login auth",
    description: "User authenticates with email and password",
    criticality: "P0",
    confirmed_by_qa: true,
  });
  insertRule(db, {
    behavior_id: bid,
    rule_text: "Lockout after 5 failed attempts",
    confidence: 1.0,
    qa_override: true,
  });
  const server = createServer(db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("query_behavior tool over MCP", () => {
  it("is listed", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("query_behavior");
  });

  it("returns matching behaviors as text + structured content", async () => {
    const client = await connectedClient();
    const res = (await client.callTool({
      name: "query_behavior",
      arguments: { query: "authenticate" },
    })) as { content: Array<{ type: string; text: string }>; structuredContent?: { count: number } };

    expect(res.content[0]?.text).toContain("Login auth");
    expect(res.structuredContent?.count).toBe(1);
  });

  it("reports no match for an unknown query", async () => {
    const client = await connectedClient();
    const res = (await client.callTool({
      name: "query_behavior",
      arguments: { query: "zzz-nope" },
    })) as { content: Array<{ type: string; text: string }> };
    expect(res.content[0]?.text).toContain("No behaviors match");
  });
});

describe("query_risk tool over MCP", () => {
  it("is listed", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("query_risk");
  });

  it("scores a matched P0 area HIGH and surfaces its rule + reasons", async () => {
    const client = await connectedClient();
    const res = (await client.callTool({
      name: "query_risk",
      arguments: { query: "authenticate" },
    })) as {
      content: Array<{ type: string; text: string }>;
      structuredContent?: { level: string; score: number; reasons: string[] };
    };
    expect(res.content[0]?.text).toContain("Risk: HIGH");
    expect(res.content[0]?.text).toContain("Lockout after 5 failed attempts");
    expect(res.structuredContent?.level).toBe("high");
  });

  it("reports unknown risk when no behavior matches", async () => {
    const client = await connectedClient();
    const res = (await client.callTool({
      name: "query_risk",
      arguments: { query: "zzz-nope" },
    })) as { structuredContent?: { level: string } };
    expect(res.structuredContent?.level).toBe("unknown");
  });
});

describe("update_rule tool over MCP", () => {
  it("attaches a QA rule to the single matching behavior", async () => {
    const client = await connectedClient();
    const res = (await client.callTool({
      name: "update_rule",
      arguments: {
        behavior: "authenticate",
        rule_text: "Sessions expire after 30 min idle",
        reason: "Security policy",
      },
    })) as { structuredContent?: { ok: boolean; action: string; rule: { qa_override: boolean; confidence: number } } };
    expect(res.structuredContent?.ok).toBe(true);
    expect(res.structuredContent?.action).toBe("create");
    expect(res.structuredContent?.rule.qa_override).toBe(true);
    expect(res.structuredContent?.rule.confidence).toBe(1.0);
  });

  it("refuses when the behavior text matches nothing", async () => {
    const client = await connectedClient();
    const res = (await client.callTool({
      name: "update_rule",
      arguments: { behavior: "zzz-nope", rule_text: "x", reason: "y" },
    })) as { structuredContent?: { ok: boolean } };
    expect(res.structuredContent?.ok).toBe(false);
  });
});
