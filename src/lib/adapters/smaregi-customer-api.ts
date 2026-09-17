import { smaregiSearch, smaregiWrite } from "@/lib/adapters/smaregi-client";

/**
 * スマレジEC・リピートAPI v2の顧客API(/api/v2/customers)。
 * 顧客マスタの検索・更新のみを扱う。顧客の新規作成そのものは行わない
 * (customer_id=-1を指定した受注APIでの自動名寄せ作成に任せる。smaregi-order-api.tsを参照)。
 */

interface SmaregiCustomerRecord {
  customer_id: string;
  email?: string;
  customer_status?: string;
  [key: string]: unknown;
}

/** メールアドレスで顧客を検索する。存在しない場合はnull。 */
export async function findCustomerByEmail(email: string): Promise<SmaregiCustomerRecord | null> {
  const response = await smaregiSearch<{ customers: SmaregiCustomerRecord[] | Record<string, SmaregiCustomerRecord> }>(
    "/api/v2/customers/search",
    {
      searchOptions: { email, limit: 1 },
      searchFields: ["customer.customer_id", "customer.email", "customer.customer_status"],
    },
  );
  const customers = Array.isArray(response.customers) ? response.customers : Object.values(response.customers ?? {});
  return customers[0] ?? null;
}

/**
 * 会員登録完了メール(チャット独自送信)に載せる仮パスワードを発行する。
 * `pre_password`に`?`をn個指定すると、スマレジ側がn文字のランダムな仮パスワードを
 * 自動生成してくれる仕様(4.6.1参照)。生成された実際の値はこのAPIのレスポンスには
 * 含まれないため、必ず本関数の呼び出し後に`findCustomerByEmail`等で確認するのではなく、
 * 呼び出し側が別途`customers/search`で`customer.pre_password`相当の値を取得できるかは
 * 未検証。実装時に一次情報での確認が必要。
 *
 * (暫定実装): 仮パスワードはこちら側で生成してそのまま指定する(`?????`方式は使わない)。
 * こうすることで、生成した値をそのままメール本文に埋め込める。
 */
export async function issueTemporaryPassword(customerId: string, temporaryPassword: string): Promise<void> {
  await smaregiWrite("/api/v2/customers/update", "customers", [
    {
      customer_id: customerId,
      pre_password: temporaryPassword,
    },
  ]);
}

/** 4〜20文字のランダムな仮パスワードを生成する(英数字)。 */
export function generateTemporaryPassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
