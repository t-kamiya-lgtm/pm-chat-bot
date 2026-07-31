import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ(クライアントコンポーネント)用のSupabaseクライアント。
 * 管理画面のGoogleログインなど、ブラウザ側で認証操作を行う場合に使用する。
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
