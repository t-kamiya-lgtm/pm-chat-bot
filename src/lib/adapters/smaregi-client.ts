import { getValidSmaregiAccessToken } from "@/lib/smaregi-oauth";

/**
 * スマレジEC・リピートAPI v2(受注API・定期申込API)の薄いクライアント。
 * search系はPHPのhttp_build_query互換のブラケット記法(a[b]=c)のクエリパラメータ、
 * create/update/remove系は単一のJSON文字列をフォームフィールドとして送る形式(ドキュメントのサンプル通り)。
 */

interface SmaregiApiResponse<T> {
  success: string;
  error_cd: string;
  error_message: string;
  response: T;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function buildBracketQuery(obj: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        parts.push(`${encodeURIComponent(`${paramKey}[${index}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === "object") {
      parts.push(...buildBracketQuery(value as Record<string, unknown>, paramKey));
    } else {
      parts.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

async function parseSmaregiResponse<T>(res: Response): Promise<T> {
  const body = (await res.json()) as SmaregiApiResponse<T>;
  if (!res.ok || body.success !== "ok") {
    throw new Error(`smaregi api error: ${body.error_cd ?? res.status} ${body.error_message ?? ""}`.trim());
  }
  return body.response;
}

/** 検索系API(受注API・定期申込APIのsearch)。読み取りのみ。 */
export async function smaregiSearch<T>(
  path: string,
  params: {
    searchOptions?: Record<string, unknown>;
    searchFields?: string[];
    responseOptions?: Record<string, unknown>;
  },
): Promise<T> {
  const domain = requireEnv("SMAREGI_DOMAIN");
  const accessToken = await getValidSmaregiAccessToken();

  const query = buildBracketQuery({
    search_options: params.searchOptions ?? {},
    search_fields: params.searchFields ?? [],
    response_options: { response_type: "json", ...params.responseOptions },
  }).join("&");

  const res = await fetch(`https://${domain}${path}?${query}`, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseSmaregiResponse<T>(res);
}

/** 登録・更新・削除系API(受注API・定期申込APIのcreate/update/remove)。 */
export async function smaregiWrite<T>(
  path: string,
  wrapperKey: string,
  records: Record<string, unknown>[],
): Promise<T> {
  const domain = requireEnv("SMAREGI_DOMAIN");
  const accessToken = await getValidSmaregiAccessToken();

  const res = await fetch(`https://${domain}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: `${wrapperKey}=${encodeURIComponent(JSON.stringify(records))}`,
  });
  return parseSmaregiResponse<T>(res);
}
