import { createClient } from "@supabase/supabase-js";

/**
 * service role キーを使うサーバー専用クライアント。
 * 全テーブルでRLSを有効化しポリシーは定義していないため、
 * アプリのデータアクセスはすべてこのクライアント経由(サーバーAPI)に統一する。
 * 絶対にブラウザ側のバンドルへ含めないこと。
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
