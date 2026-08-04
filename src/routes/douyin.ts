import { Hono } from "hono";
import type { Env, Vars } from "../types.ts";
import { handleDouyinPost, handleDouyinGet, handleDouyinRequest } from "../lib/douyin-protocol.ts";

const douyin = new Hono<{ Bindings: Env; Variables: Vars }>();

// 根路径
douyin.get("/", handleDouyinGet);
douyin.post("/", handleDouyinPost);

// /events 路径：兼容 iOS 快捷指令
douyin.get("/events", handleDouyinGet);
douyin.post("/events", async (c) => {
  // 1. 读取原始请求体
  const bodyText = await c.req.text();
  console.log("[DOUYIN /events POST] Raw body:", bodyText);

  // 2. 尝试解析 JSON
  let bodyJson: any;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch (e) {
    return c.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error: Invalid JSON" }
    }, 400);
  }

  // 3. 如果是简单格式 { type: "xxx", value: "xxx" }，转换为 JSON-RPC
  // 3a. 如果有 tool 字段，直接使用
  // 3b. 如果有 type 或 value 字段，默认调用 query_douyin
  let toolName = bodyJson.tool || "query_douyin";
  let args = bodyJson.args || {};

  // 如果请求体直接包含 type 或 value，将其作为查询参数
  if (bodyJson.type || bodyJson.value) {
    args = {
      type: bodyJson.type || "",
      value: bodyJson.value || "",
      hours: bodyJson.hours || 6,
      limit: bodyJson.limit || 100
    };
  }

  // 构造 JSON-RPC 请求（自动生成 id）
  const jsonRpcRequest = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    },
    id: Date.now()  // 自动生成 id
  };

  const sql = c.var.sql;
  const offsetMinutes = c.var.offsetMinutes;
  try {
    const result = await handleDouyinRequest(jsonRpcRequest, sql, offsetMinutes);
    return c.json(result);
  } catch (err) {
    console.error("[DOUYIN /events POST] Error:", err);
    return c.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "Internal error" }
    }, 500);
  }
});

export { douyin };
