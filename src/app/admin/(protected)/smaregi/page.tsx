import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { getSmaregiConnectionStatus } from "@/lib/smaregi-oauth";

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

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">スマレジ連携</h1>
      <p className="mb-6 text-sm text-neutral-500">
        代引き・後払いの注文をスマレジEC・リピートへ連携するためのOAuth2認証です。連携すると、以後は自動でアクセストークンが更新されます。
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
    </div>
  );
}
