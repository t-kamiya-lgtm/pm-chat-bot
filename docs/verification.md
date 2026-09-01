# 移行後の動作検証(Phase 10)

自動テストが一切ないため、Supabase→Google Cloud移行の前後で以下を確認する。
`scripts/smoke-test.mjs` は認証不要の導線・Cronエンドポイントの認証をfetchベースで
自動チェックする軽量スクリプト。ステージング→本番切替の両方で実行すること。

```bash
BASE_URL=https://<デプロイ先のURL> CRON_SECRET=<本番のCRON_SECRET> node scripts/smoke-test.mjs
```

## この開発環境(サンドボックス)で実際に確認したこと

GCP/Firebase/Stripeの実クレデンシャルがないため、`src/lib/db.ts`を一時的に
ローカルPostgres直結に差し替えて(コミットはしていない)`next dev`を起動し、
ローカルPostgreSQL 16(`db/migrations/*.sql`適用済み)に対して以下を実際にHTTPリクエストで確認した。

- **Cronエンドポイント**: `Authorization`ヘッダー未指定・誤ったシークレットで401、
  正しい`CRON_SECRET`で200(`abandoned-leads`・`subscription-renewals`とも実際にDBへ
  クエリを実行し正常応答)。
- **公開ウィジェットAPI**: `business-closed-dates` / `checkout-fields` / `checkout-messages` /
  `scenario`(投入したテストシナリオを実際に取得、ノード・商品・メニュー項目・クーポンを
  含む複雑なリレーショナルクエリが正しく動作)/ `faqs` がいずれも200で応答。
- **クーポン適用ロジック**: `/api/widget/coupon` に手入力コードを渡し、10%割引クーポンで
  `discountAmount`が正しく計算されること、無効なコードでは`invalidCode: true`になることを確認。
- **Postgres RPC関数(Phase 6パターン3で書き換えたJS側から呼び出す関数本体)**:
  - `increment_coupon_usage`: 呼び出しごとに`coupons.used_count`が1ずつ増加すること。
  - `assign_customer_number`: 初回呼び出しで`customer_number`が採番され、2回目の呼び出しでは
    (既に採番済みのため)値が変わらないこと(重複実行での二重採番なし)。
- **認証ゲート**: セッションCookie未指定の状態で管理系API(`/api/products`, `/api/scenarios`,
  `/api/coupons`, `/api/customers/[id]`)がいずれも401を返すこと(`getCurrentAppUser()`が
  Cookie不在時はFirebase Admin SDKを呼ばずに即座に`null`を返す実装のため、実際のFirebase
  プロジェクトなしでもこの経路は検証できた)。

## 実施者が実際のステージング/本番環境で確認する必要があること

以下はGoogleアカウントでの実ログイン・Stripeテストモードでの実決済が必要なため、
この環境では自動化・実行ができていない。

1. **認証**: 事前招待済みのGoogleアカウントでログインでき、`/admin`にリダイレクトなしで
   到達すること。招待されていない/許可ドメイン外のアカウントは拒否されること。
2. **CRUD往復**: 管理画面から`products`・`scenarios`・`customers`・`coupons`それぞれで
   作成→取得→更新→削除が一往復すること。
3. **決済フロー**: Stripeテストモードで単発注文・定期購読をそれぞれ1件ずつ最後まで通し、
   `orders`/`subscriptions`が正しく作成されること。
4. **Cronエンドポイント(本番環境)**: `docs/deploy.md`のCloud Schedulerジョブ作成後、
   実際にジョブを手動実行(`gcloud scheduler jobs run <job名>`)して200が返ること。
