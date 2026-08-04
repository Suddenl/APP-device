import { Hono } from "hono";
import type { Env, Vars } from "../types.ts";
import { handleMcpPost, handleMcpGet } from "../lib/mcp-protocol.ts";

const mcp = new Hono<{ Bindings: Env; Variables: Vars }>();

// POST：标准 MCP 调用（Kelivo 等客户端使用）
mcp.post("/", handleMcpPost);

// GET：支持查询参数调用工具（浏览器测试用）
// 无参数时返回服务状态
mcp.get("/", handleMcpGet);

export { mcp };
