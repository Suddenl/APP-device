import { Hono } from "hono";
import type { Env, Vars } from "./types.ts";
import { corsMiddleware } from "./middleware/cors.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { createSql } from "./lib/db.ts";
import { parseOffsetEnv } from "./lib/timezone.ts";
import { events } from "./routes/events.ts";
import { mcp } from "./routes/mcp.ts";
import { douyin } from "./routes/douyin.ts";   // 🆕 导入抖音路由
import type postgres from "postgres";

export type AppOptions = {
  postgresOptions?: Record<string, unknown>;
};

export function createApp(options?: AppOptions) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();

  let sqlInstance: postgres.Sql | null = null;
  let cachedOffsetMinutes: number | null = null;

  // CORS
  app.use("*", corsMiddleware);

  // ========== 新增：调试中间件（可选，建议保留） ==========
  app.use("*", async (c, next) => {
    console.log(`[DEBUG] ${c.req.method} ${c.req.url}`);
    await next();
  });
  // ==================================================

  // Global error handler
  app.onError((err, c) => {
    console.error("Unexpected error:", err);
    return c.json({ error: "Internal server error" }, 500);
  });

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: "Not found" }, 404);
  });

  // DB + timezone injection
  app.use("*", async (c, next) => {
    if (!sqlInstance) {
      const databaseUrl = c.env.DATABASE_URL ?? "";
      sqlInstance = createSql(databaseUrl, options?.postgresOptions);
      await sqlInstance.unsafe(`
        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL CHECK (type ~ '^[a-z0-9]+(\\.[a-z0-9]+)*$'),
          value TEXT,
          ts TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts);
        CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
      `);
    }
    if (cachedOffsetMinutes === null) {
      cachedOffsetMinutes = parseOffsetEnv(c.env.TZ_OFFSET);
    }
    c.set("sql", sqlInstance);
    c.set("offsetMinutes", cachedOffsetMinutes);
    await next();
  });

  // Routes
  app.route("/events", (() => {
    const group = new Hono<{ Bindings: Env; Variables: Vars }>();
    group.use("*", authMiddleware);
    group.route("/", events);
    return group;
  })());

  app.route("/mcp", mcp);          // 原有 MCP 服务（设备事件）
  app.route("/douyin", douyin);    // 🆕 抖音 MCP 服务

  return app;
}
