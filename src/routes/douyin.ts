import { Hono } from "hono";
import type { Env, Vars } from "../types.ts";
import { handleDouyinPost, handleDouyinGet } from "../lib/douyin-protocol.ts";

const douyin = new Hono<{ Bindings: Env; Variables: Vars }>();

// 原有的 POST 和 GET 根路径
douyin.post("/", handleDouyinPost);
douyin.get("/", handleDouyinGet);

// 🆕 新增：让 /events 也能响应 GET 请求（用于 iOS 快捷指令）
douyin.get("/events", async (c) => {
  // 复用 handleDouyinGet 的逻辑（它支持 ?tool=xxx 参数）
  // 如果请求带参数，就调用工具；否则返回工具列表或状态
  return handleDouyinGet(c);
});

export { douyin };
