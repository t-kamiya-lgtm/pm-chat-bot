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

/**
 * ドキュメント上はJSONレスポンスは常にUTF-8とされているが、実際にはShift-JISで
 * 返ってくるため(日本語部分が文字化けすることを確認済み)、Shift-JISとしてデコードする。
 */
async function decodeSmaregiBody(res: Response): Promise<string> {
  const buffer = await res.arrayBuffer();
  return new TextDecoder("shift-jis").decode(buffer);
}

async function parseSmaregiResponse<T>(res: Response): Promise<T> {
  const text = await decodeSmaregiBody(res);
  let body: SmaregiApiResponse<T> | null = null;
  try {
    body = JSON.parse(text) as SmaregiApiResponse<T>;
  } catch {
    // レスポンスがJSONでない場合(WAFのブロックページ等)、生テキストをそのままエラーに含める
  }

  if (!res.ok || !body || body.success !== "ok") {
    const detail = body ? `${body.error_cd ?? ""} ${body.error_message ?? ""}`.trim() : text.slice(0, 500);
    throw new Error(`smaregi api error (HTTP ${res.status}): ${detail}`);
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

  const body = buildBracketQuery({
    search_options: params.searchOptions ?? {},
    search_fields: params.searchFields ?? [],
    response_options: { response_type: "json", ...params.responseOptions },
  }).join("&");

  const url = `https://${domain}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  try {
    return await parseSmaregiResponse<T>(res);
  } catch (err) {
    throw new Error(`${err instanceof Error ? err.message : String(err)} (url: ${url}, body: ${body})`);
  }
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
