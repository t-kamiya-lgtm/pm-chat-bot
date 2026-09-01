import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import * as relations from "@/db/relations";

/**
 * Cloud SQL (PostgreSQL) への接続。src/lib/supabase/admin.ts に相当する、
 * アプリの全データアクセスが経由する唯一のクライアント。
 *
 * Connector・Pool・drizzleインスタンスはモジュールレベルでシングルトン化し、
 * 同一Cloud Runコンテナ内のリクエスト間で使い回す(サーバーレスの毎リクエスト
 * 新規接続と違い、Cloud Runは常駐コンテナのためコネクションプールが機能する)。
 */

let dbPromise: Promise<ReturnType<typeof drizzle<typeof schema & typeof relations>>> | null = null;

async function createPool(): Promise<Pool> {
  const connector = new Connector();
  const clientOpts = await connector.getOptions({
    instanceConnectionName: requireEnv("CLOUD_SQL_INSTANCE_CONNECTION_NAME"),
    ipType: process.env.CLOUD_SQL_IP_TYPE === "PRIVATE" ? IpAddressTypes.PRIVATE : IpAddressTypes.PUBLIC,
    authType: process.env.CLOUD_SQL_AUTH_TYPE === "IAM" ? AuthTypes.IAM : AuthTypes.PASSWORD,
  });

  return new Pool({
    ...clientOpts,
    user: requireEnv("DB_USER"),
    database: requireEnv("DB_NAME"),
    password: process.env.CLOUD_SQL_AUTH_TYPE === "IAM" ? undefined : requireEnv("DB_PASSWORD"),
    max: 10,
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

/** Drizzleクライアントを取得する(初回呼び出し時に接続を確立し、以後は使い回す)。 */
export async function getDb() {
  if (!dbPromise) {
    dbPromise = createPool()
      .then((pool) => drizzle(pool, { schema: { ...schema, ...relations } }))
      .catch((err) => {
        // 接続確立に失敗した場合、次回呼び出しで再試行できるようキャッシュをクリアする
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}
