import { Hono } from "hono";
import type { Env, Vars } from "../types.ts";
import { handleDouyinPost, handleDouyinGet } from "../lib/douyin-protocol.ts";

const douyin = new Hono<{ Bindings: Env; Variables: Vars }>();

// 原有的根路径
douyin.post("/", handleDouyinPost);
douyin.get("/", handleDouyinGet);

// 🆕 让 /events 同时支持 GET 和 POST
douyin.get("/events", handleDouyinGet);
douyin.post("/events", handleDouyinPost);   // ← 新增这行！

export { douyin };
