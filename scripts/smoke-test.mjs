#!/usr/bin/env node
/**
 * 移行前後の動作確認用の軽量スモークテスト(要件定義に基づくPhase 10)。
 * Playwright等は使わず、fetchベースで主要な導線が動くことだけを確認する。
 * BASE_URL・CRON_SECRET・(必要なら)管理画面セッションCookieを環境変数で渡して実行する。
 *
 *   BASE_URL=https://staging.example.com CRON_SECRET=xxx node scripts/smoke-test.mjs
 *
 * Stripe決済フロー(単発・定期)と管理画面ログインは、実際のStripeテストモード決済・
 * 実際のGoogleアカウントでのログイン操作が必要なため、このスクリプトでは自動化していない。
 * 手動で以下を確認すること:
 *   1. 認証: 招待済みGoogleアカウントでログイン→/adminにリダイレクトなしで到達。
 *      招待されていない/許可ドメイン外のアカウントは拒否されること。
 *   2. 決済: Stripeテストモードで単発注文・定期購読を1件ずつ最後まで通し、
 *      管理画面の注文一覧にordersが、定期の場合はsubscriptionsが作成されていること。
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`OK   ${label}`);
  } else {
    failed++;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  // --- Cronエンドポイント: 認証 ---
  {
    const res = await fetch(`${BASE_URL}/api/cron/abandoned-leads`, { method: "POST" });
    check("cron/abandoned-leads: 認証ヘッダーなしで401", res.status === 401, `status=${res.status}`);
  }
  {
    const res = await fetch(`${BASE_URL}/api/cron/abandoned-leads`, {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    check("cron/abandoned-leads: 誤ったシークレットで401", res.status === 401, `status=${res.status}`);
  }
  if (CRON_SECRET) {
    for (const path of ["/api/cron/abandoned-leads", "/api/cron/subscription-renewals"]) {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      check(`cron${path}: 正しいシークレットで200`, res.status === 200, `status=${res.status}`);
    }
  } else {
    console.log("SKIP cron: CRON_SECRET未設定のため正常系は未実行");
  }

  // --- 公開ウィジェットAPI: 認証不要でDB往復できること ---
  for (const path of [
    "/api/widget/business-closed-dates",
    "/api/widget/checkout-fields",
    "/api/widget/checkout-messages",
  ]) {
    const res = await fetch(`${BASE_URL}${path}`);
    check(`widget${path}: 200`, res.status === 200, `status=${res.status}`);
  }

  // --- クーポン適用プレビュー(公開エンドポイント) ---
  {
    const res = await fetch(`${BASE_URL}/api/widget/coupon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subtotal: 1000 }),
    });
    const body = await res.json().catch(() => null);
    check(
      "widget/coupon: コード未指定で200・discountAmount=0",
      res.status === 200 && body?.discountAmount === 0,
      JSON.stringify(body),
    );
  }

  // --- 管理画面API: 未ログインで401(認証ゲートが機能していること) ---
  for (const path of ["/api/products", "/api/scenarios", "/api/coupons"]) {
    const res = await fetch(`${BASE_URL}${path}`);
    check(`admin${path}: 未認証で401`, res.status === 401, `status=${res.status}`);
  }
  {
    const res = await fetch(`${BASE_URL}/api/customers/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    check("admin/api/customers/[id] (PATCH): 未認証で401", res.status === 401, `status=${res.status}`);
  }

  console.log(failed === 0 ? "\nすべて成功" : `\n${failed}件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
