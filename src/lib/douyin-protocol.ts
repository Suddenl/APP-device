import type { Context } from "hono";
import type postgres from "postgres";
import type { Env, Vars, JsonRpcId, JsonRpcMessage } from "../types.ts";
import { queryDouyin, parseDouyinQueryFromToolArgs, buildDouyinSummaryText } from "./douyin-queries.ts";
import { withRetry } from "./db.ts";

const DEFAULT_MCP_PROTOCOL_VERSION = "2025-03-26";
const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
]);

const DOUYIN_SERVER_INFO = {
  name: "douyin-data-logger",
  title: "Douyin Data Logger",
  version: "1.0.0",
  description: "Query Douyin user activity records from a database. Read-only.",
};

// 定义抖音查询工具
const QUERY_DOUYIN_TOOL = {
  name: "query_douyin",
  title: "Query Douyin Records",
  description: "Query Douyin watch history or interaction records by time range.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      hours: {
        type: "number",
        description: "Look back N hours. Defaults to 6 when since is omitted.",
        minimum: 0.001,
      },
      since: {
        type: "string",
        description: "Start time in ISO 8601 format. Overrides the default hours window.",
      },
      until: {
        type: "string",
        description: "End time in ISO 8601 format. Defaults to now.",
      },
      type: {
        type: "string",
        description: "Event type filter (e.g. 'video_watch', 'like', 'comment').",
      },
      value: {
        type: "string",
        description: "Exact value filter (e.g. video ID or user name).",
      },
      limit: {
        type: "integer",
        description: "Maximum number of records to return. Default 100, max 1000.",
        minimum: 1,
        maximum: 1000,
      },
      offset: {
        type: "integer",
        description: "Pagination offset. Default 0.",
        minimum: 0,
      },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      total: { type: "integer" },
      records: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "integer" },
            type: { type: "string" },
            value: { anyOf: [{ type: "string" }, { type: "null" }] },
            ts: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
          required: ["id", "type", "value", "ts"],
        },
      },
    },
    required: ["total", "records"],
  },
};

const LIST_DOUYIN_TYPES_TOOL = {
  name: "list_douyin_types",
  title: "List Douyin Event Types",
  description: "List all distinct event types currently stored in the Douyin database.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      types: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["types"],
  },
};

// 辅助函数
function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0" as const,
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function jsonRpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function isJsonRpcRequest(message: JsonRpcMessage): boolean {
  return typeof message.method === "string" && Object.prototype.hasOwnProperty.call(message, "id");
}

function isJsonRpcNotification(message: JsonRpcMessage): boolean {
  return typeof message.method === "string" && !Object.prototype.hasOwnProperty.call(message, "id");
}

function isJsonRpcResponse(message: JsonRpcMessage): boolean {
  return Object.prototype.hasOwnProperty.call(message, "result") ||
    Object.prototype.hasOwnProperty.call(message, "error");
}

function getProtocolVersionFromHeaders(c: Context): string {
  const header = c.req.header("mcp-protocol-version")?.trim();
  return header || DEFAULT_MCP_PROTOCOL_VERSION;
}

// 抖音查询工具的具体实现
async function callQueryDouyinTool(args: Record<string, unknown>, sql: postgres.Sql, offsetMinutes: number) {
  const parsed = parseDouyinQueryFromToolArgs(args);
  if (typeof parsed === "string") {
    return { content: [{ type: "text", text: parsed }], isError: true };
  }
  try {
    const result = await queryDouyin(parsed, sql, offsetMinutes);
    return {
      content: [{ type: "text", text: buildDouyinSummaryText(result.events, result.total) }],
      structuredContent: result,
      isError: false,
    };
  } catch (error) {
    console.error("Douyin query failed:", error);
    return { content: [{ type: "text", text: "Database error while querying Douyin records." }], isError: true };
  }
}

async function callListDouyinTypesTool(sql: postgres.Sql) {
  try {
    const rows = await withRetry(() =>
      sql.unsafe("SELECT DISTINCT type FROM douyin_events ORDER BY type")
    );
    const types = rows.map((r: Record<string, unknown>) => String(r.type));
    return {
      content: [{ type: "text", text: types.length ? types.join("\n") : "No Douyin event types found." }],
      structuredContent: { types },
      isError: false,
    };
  } catch (error) {
    console.error("Douyin list types failed:", error);
    return { content: [{ type: "text", text: "Database error while listing Douyin event types." }], isError: true };
  }
}

// 核心请求处理器（导出供路由层调用）
export async function handleDouyinRequest(message: JsonRpcMessage, sql: postgres.Sql, offsetMinutes: number) {
  const id = (message.id ?? null) as JsonRpcId;
  const method = typeof message.method === "string" ? message.method : "";
  const params = (message.params && typeof message.params === "object")
    ? message.params as Record<string, unknown>
    : {};

  switch (method) {
    case "initialize": {
      const requestedVersion = typeof params.protocolVersion === "string"
        ? params.protocolVersion
        : "";
      if (!requestedVersion || !SUPPORTED_MCP_PROTOCOL_VERSIONS.has(requestedVersion)) {
        return jsonRpcError(id, -32602, "Unsupported protocolVersion", {
          supported: Array.from(SUPPORTED_MCP_PROTOCOL_VERSIONS),
        });
      }
      return jsonRpcResult(id, {
        protocolVersion: requestedVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: DOUYIN_SERVER_INFO,
        instructions: "This server provides read-only access to Douyin user activity records.",
      });
    }
    case "notifications/initialized":
      return null;
    case "ping":
      return jsonRpcResult(id, {});
    case "tools/list":
      return jsonRpcResult(id, {
        tools: [QUERY_DOUYIN_TOOL, LIST_DOUYIN_TYPES_TOOL],
      });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      if (name === LIST_DOUYIN_TYPES_TOOL.name) {
        return jsonRpcResult(id, await callListDouyinTypesTool(sql));
      }
      if (name !== QUERY_DOUYIN_TOOL.name) {
        return jsonRpcError(id, -32601, `Unknown tool: ${name || "(empty)"}`);
      }
      const args = (params.arguments && typeof params.arguments === "object")
        ? params.arguments as Record<string, unknown>
        : {};
      return jsonRpcResult(id, await callQueryDouyinTool(args, sql, offsetMinutes));
    }
    default:
      return jsonRpcError(id, -32601, `Method not found: ${method || "(empty)"}`);
  }
}

// POST 处理函数
export async function handleDouyinPost(c: Context<{ Bindings: Env; Variables: Vars }>): Promise<Response> {
  const sql = c.var.sql;
  const offsetMinutes = c.var.offsetMinutes;

  const version = c.req.header("mcp-protocol-version")?.trim();
  if (version && !SUPPORTED_MCP_PROTOCOL_VERSIONS.has(version)) {
    return c.json({ error: `Unsupported MCP protocol version: ${version}` }, 400);
  }

  const protocolVersion = getProtocolVersionFromHeaders(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    c.header("MCP-Protocol-Version", protocolVersion);
    return c.json(jsonRpcError(null, -32700, "Parse error"), 400);
  }

  // Batch handling
  if (Array.isArray(body)) {
    if (!body.length) {
      c.header("MCP-Protocol-Version", protocolVersion);
      return c.json(jsonRpcError(null, -32600, "Invalid Request"), 400);
    }
    const responses: unknown[] = [];
    for (const item of body) {
      if (!item || typeof item !== "object") {
        responses.push(jsonRpcError(null, -32600, "Invalid Request"));
        continue;
      }
      const message = item as JsonRpcMessage;
      if (isJsonRpcNotification(message) || isJsonRpcResponse(message)) continue;
      if (!isJsonRpcRequest(message)) {
        responses.push(jsonRpcError(null, -32600, "Invalid Request"));
        continue;
      }
      responses.push(await handleDouyinRequest(message, sql, offsetMinutes));
    }
    if (!responses.length) {
      return c.body(null, 202);
    }
    c.header("MCP-Protocol-Version", protocolVersion);
    return c.json(responses);
  }

  // Single message
  if (!body || typeof body !== "object") {
    c.header("MCP-Protocol-Version", protocolVersion);
    return c.json(jsonRpcError(null, -32600, "Invalid Request"), 400);
  }
  const message = body as JsonRpcMessage;
  if (isJsonRpcNotification(message) || isJsonRpcResponse(message)) {
    return c.body(null, 202);
  }
  if (!isJsonRpcRequest(message)) {
    c.header("MCP-Protocol-Version", protocolVersion);
    return c.json(jsonRpcError(null, -32600, "Invalid Request"), 400);
  }
  const response = await handleDouyinRequest(message, sql, offsetMinutes);
  if (response == null) {
    return c.body(null, 202);
  }
  c.header("MCP-Protocol-Version", protocolVersion);
  return c.json(response);
}

// GET 处理函数（支持查询参数调用工具）
export async function handleDouyinGet(c: Context<{ Bindings: Env; Variables: Vars }>): Promise<Response> {
  const sql = c.var.sql;
  const offsetMinutes = c.var.offsetMinutes;
  const query = c.req.query();

  const toolName = query.tool;
  if (!toolName) {
    return c.json({ status: "ok", message: "Douyin MCP server ready" });
  }

  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key !== "tool" && value !== undefined) {
      const num = Number(value);
      args[key] = isNaN(num) ? value : num;
    }
  }

  const message: JsonRpcMessage = {
    jsonrpc: "2.0" as const,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args,
    },
    id: Date.now(),
  };

  try {
    const result = await handleDouyinRequest(message, sql, offsetMinutes);
    if (result == null) {
      return c.body(null, 202);
    }
    return c.json(result);
  } catch (error) {
    console.error("GET Douyin call failed:", error);
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal error" },
      },
      500
    );
  }
}
