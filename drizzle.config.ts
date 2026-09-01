import { defineConfig } from "drizzle-kit";

// 通常運用時(アプリのランタイム)はsrc/lib/db.tsがCloud SQL Connector経由で接続する。
// このファイルはdrizzle-kit(introspect/generate等の開発時コマンド)専用の設定で、
// DATABASE_URLで指定した接続先(Cloud SQL Auth Proxy経由のlocalhost、またはローカルDB)に対して使う。
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./db/drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/pm_chat_bot_dev",
  },
});
