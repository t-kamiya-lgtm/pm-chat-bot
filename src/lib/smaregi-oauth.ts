import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * スマレジEC・リピートAPIのOAuth2連携(基本設定＞外部アプリ連携)。
 * 認可コードフローのため、管理者がブラウザで一度だけ許可ページを通す必要がある。
 * アクセストークンにはexpires_in/refresh_tokenが返らない場合もあるため両方null許容で扱う。
 */

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function siteUrl(): string {
  return requireEnv("NEXT_PUBLIC_SITE_URL");
}

export function getSmaregiOauthRedirectUri(): string {
  // スマレジEC・リピート側の「外部アプリ連携」に登録済みのリダイレクトURLと完全一致させる必要がある。
  return `${siteUrl()}/api/smaregi/callback`;
}

export function getSmaregiAuthorizeUrl(state: string): string {
  const domain = requireEnv("SMAREGI_DOMAIN");
  const params = new URLSearchParams({
    client_id: requireEnv("SMAREGI_CLIENT_ID"),
    redirect_uri: getSmaregiOauthRedirectUri(),
    response_type: "code",
    state,
    // scopeパラメータを付けるとinvalid_scopeで認可ページ自体が表示できないため一時的に外す。
    // アプリ側(外部アプリ連携の編集画面)で権限を設定する必要がある可能性を調査中。
  });
  return `https://${domain}/api/oauth/authorize.php?${params.toString()}`;
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const domain = requireEnv("SMAREGI_DOMAIN");
  const res = await fetch(`https://${domain}/api/oauth/token.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await res.json()) as TokenResponse & { error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`smaregi oauth token request failed: ${body.error ?? res.status}`);
  }
  return body;
}

async function storeTokens(token: TokenResponse): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  const { error } = await supabase.from("smaregi_oauth_tokens").upsert({
    id: 1,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** 認可コードを初回のアクセストークンに交換して保存する(認可ページからのリダイレクト後に一度だけ呼ぶ)。 */
export async function exchangeSmaregiCodeForToken(code: string): Promise<void> {
  const token = await requestToken({
    client_id: requireEnv("SMAREGI_CLIENT_ID"),
    client_secret: requireEnv("SMAREGI_CLIENT_SECRET"),
    code,
    grant_type: "client_credentials",
    redirect_uri: getSmaregiOauthRedirectUri(),
  });
  await storeTokens(token);
}

async function refreshSmaregiToken(refreshToken: string): Promise<string> {
  const token = await requestToken({
    client_id: requireEnv("SMAREGI_CLIENT_ID"),
    client_secret: requireEnv("SMAREGI_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  await storeTokens(token);
  return token.access_token;
}

/** 診断用: トークンが化けていないか目視確認するためのマスク済み情報(先頭/末尾数文字と長さのみ)。 */
export async function getSmaregiTokenDebugInfo(): Promise<{ length: number; preview: string } | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("smaregi_oauth_tokens").select("access_token").eq("id", 1).maybeSingle();
  const token = (data?.access_token as string | undefined) ?? null;
  if (!token) return null;
  return { length: token.length, preview: `${token.slice(0, 6)}...${token.slice(-4)}` };
}

/** 接続状態の確認用(管理画面表示)。 */
export async function getSmaregiConnectionStatus(): Promise<{ connected: boolean; expiresAt: string | null }> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("smaregi_oauth_tokens").select("expires_at").eq("id", 1).maybeSingle();
  return { connected: Boolean(data), expiresAt: (data?.expires_at as string | null) ?? null };
}

/** APIコール用の有効なアクセストークンを返す。期限切れが近く、refresh_tokenがある場合は再取得する。 */
export async function getValidSmaregiAccessToken(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("smaregi_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("id", 1)
    .maybeSingle();
  const row = data as TokenRow | null;
  if (!row) throw new Error("smaregi is not connected yet (run the OAuth connect flow first)");

  const nearExpiry = row.expires_at && new Date(row.expires_at).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  if (nearExpiry && row.refresh_token) {
    return refreshSmaregiToken(row.refresh_token);
  }
  return row.access_token;
}
