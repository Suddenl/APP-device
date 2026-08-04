import { Hono } from "hono";
import type { Env, Vars } from "../types.ts";
import { handleDouyinPost, handleDouyinGet, handleDouyinRequest } from "../lib/douyin-protocol.ts";

const douyin = new Hono<{ Bindings: Env; Variables: Vars }>();

// 根路径
douyin.get("/", handleDouyinGet);
douyin.post("/", handleDouyinPost);

// MCP 查询路径（供 Kelivo 和浏览器测试调用）
douyin.get("/events", handleDouyinGet);
douyin.post("/events", async (c) => {
  // ... 这里保留你之前写好的转换逻辑（把简单格式转成 JSON-RPC 查询）...
  // （就是你之前写的那一大段处理 /events POST 的代码）
});

// 🆕 实时记录路径（供 iOS 快捷指令“打开/关闭抖音”时调用）
douyin.post("/log", async (c) => {
  const sql = c.var.sql;
  const body = await c.req.json();
  
  const type = body.type || 'unknown';
  const value = body.value || null;
  
  console.log(`[DOUYIN LOG] 记录事件: type=${type}, value=${value}`);
  
  try {
    await sql.unsafe(
      'INSERT INTO douyin_events (type, value, ts) VALUES ($1, $2, NOW())',
      [type, value]
    );
    return c.json({ status: "ok", message: "Event logged successfully" });
  } catch (err) {
    console.error("[DOUYIN LOG] 写入失败:", err);
    return c.json({ status: "error", message: "Failed to log event" }, 500);
  }
});

export { douyin };
