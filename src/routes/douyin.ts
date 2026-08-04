import { Hono } from "hono";
import type { Env, Vars } from "../types.ts";
import { handleDouyinPost, handleDouyinGet, handleDouyinRequest } from "../lib/douyin-protocol.ts";

const douyin = new Hono<{ Bindings: Env; Variables: Vars }>();

// 根路径：GET 健康检查，POST 标准 MCP 调用
douyin.get("/", handleDouyinGet);
douyin.post("/", handleDouyinPost);

// /events 路径：专为 iOS 快捷指令设计，打印请求体并兼容简单格式
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
    console.error("[DOUYIN /events POST] Invalid JSON:", e);
    return c.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error: Invalid JSON" }
    }, 400);
  }

  // 3. 如果请求体是简单格式 { tool: "xxx", ... }，转换为 JSON-RPC
  if (bodyJson.tool && !bodyJson.jsonrpc) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: bodyJson.tool,
        arguments: bodyJson.args || {}
      },
      id: Date.now()
    };
    const sql = c.var.sql;
    const offsetMinutes = c.var.offsetMinutes;
    try {
      const result = await handleDouyinRequest(jsonRpcRequest, sql, offsetMinutes);
      return c.json(result);
    } catch (err) {
      console.error("[DOUYIN /events POST] Tool call error:", err);
      return c.json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal error" }
      }, 500);
    }
  }

  // 4. 否则视为标准 JSON-RPC 格式，直接处理
  const sql = c.var.sql;
  const offsetMinutes = c.var.offsetMinutes;
  try {
    const result = await handleDouyinRequest(bodyJson, sql, offsetMinutes);
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
