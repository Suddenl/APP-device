import { Hono } from "hono";
import type { Env, Vars } from "../types.ts";
import { handleDouyinPost, handleDouyinGet } from "../lib/douyin-protocol.ts";

const douyin = new Hono<{ Bindings: Env; Variables: Vars }>();

// POST：处理 JSON-RPC 调用（Kelivo 等客户端使用）
douyin.post("/", handleDouyinPost);

// GET：支持查询参数调用工具（浏览器测试用），无参数时返回服务状态
douyin.get("/", handleDouyinGet);

export { douyin };
