import { Hono } from "hono";
import type { Env, Vars } from "../types.ts";
import { handleMcpPost } from "../lib/mcp-protocol.ts";

const mcp = new Hono<{ Bindings: Env; Variables: Vars }>();

mcp.post("/", handleMcpPost);

mcp.get("/", (c) => {
  return c.json({ status: "ok", message: "MCP server ready" });
});

export { mcp };
