import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getCurrentAppUser } from "@/lib/auth";
import { getSmaregiConnectionStatus } from "@/lib/smaregi-oauth";
import { getDb } from "@/lib/db";
import { orders, smaregiSyncLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

const RESULT_MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: { tone: "ok", text: "スマレジEC・リピートとの連携が完了しました。" },
  error: { tone: "error", text: "アクセストークンの取得に失敗しました。時間をおいて再度お試しください。" },
  state_mismatch: { tone: "error", text: "連携処理が正しく完了しませんでした。もう一度お試しください。" },
};

export default async function AdminSmaregiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/admin/login");
  if (currentUser.role !== "admin") redirect("/admin");

  const sp = await searchParams;
  const resultKey = sp.smaregi_oauth;
  const result = typeof resultKey === "string" ? RESULT_MESSAGES[resultKey] : undefined;

  const { connected, expiresAt } = await getSmaregiConnectionStatus();

  const db = await getDb();
  const recentLogs = await db
    .select({
      id: smaregiSyncLogs.id,
      status: smaregiSyncLogs.status,
      error: smaregiSyncLogs.error,
      createdAt: smaregiSyncLogs.createdAt,
      orderNumber: orders.orderNumber,
    })
    .from(smaregiSyncLogs)
    .leftJoin(orders, eq(orders.id, smaregiSyncLogs.orderId))
    .orderBy(desc(smaregiSyncLogs.createdAt))
    .limit(20);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">スマレジ連携</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Stripe決済・代引き・後払いの注文を、primedirect.jp(スマレジEC・リピート上に構築された自社ECサイト)へ
        連携するためのOAuth2認証です。連携すると、以後は自動でアクセストークンが更新されます。
      </p>

      {result && (
        <div
          className={`mb-4 rounded-lg border p-4 text-sm ${
            result.tone === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {result.text}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="mb-1 text-sm">
          接続状態:{" "}
          <span className={connected ? "font-semibold text-green-700" : "font-semibold text-neutral-500"}>
            {connected ? "連携済み" : "未連携"}
          </span>
        </p>
        {expiresAt && (
          <p className="mb-4 text-xs text-neutral-500">
            アクセストークン有効期限: {new Date(expiresAt).toLocaleString("ja-JP")}
          </p>
        )}

        <a
          href="/api/admin/smaregi/oauth/start"
          className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          {connected ? "再連携する" : "連携する"}
        </a>
      </div>

      <h2 className="mt-8 mb-2 text-lg font-semibold">直近の連携ログ</h2>
      <p className="mb-4 text-sm text-neutral-500">
        注文確定時にprimedirect.jp受注APIへ連携した結果(新しい順、最大20件)。
        未連携の間は「error」(smaregi is not connected yet)が記録され続けるのが正常な状態です。
      </p>
      {recentLogs.length === 0 ? (
        <p className="text-sm text-neutral-500">まだ連携ログがありません。</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-4 py-2 font-medium">日時</th>
                <th className="px-4 py-2 font-medium">注文番号</th>
                <th className="px-4 py-2 font-medium">結果</th>
                <th className="px-4 py-2 font-medium">エラー内容</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap text-neutral-500">
                    {new Date(log.createdAt).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-4 py-2">{log.orderNumber ?? "-"}</td>
                  <td className="px-4 py-2">
                    <span className={log.status === "ok" ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{log.error ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
