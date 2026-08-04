import { Hono } from "hono";
import type { Env, Vars } from "../types.ts";
import { handleMcpPost, handleMcpGet } from "../lib/mcp-protocol.ts";

const mcp = new Hono<{ Bindings: Env; Variables: Vars }>();

mcp.post("/", handleMcpPost);

mcp.get("/", handleMcpGet);

export { mcp };
