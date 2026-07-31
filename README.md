# pm-chat-bot

プロテインモンスターチャットボット決済システム。

スマレジEC上にポップアップ表示するチャットボットで、商品提案から決済(単発・定期)、
スマレジECへの会員情報連携までを完結させるシステムです。
詳細な要件・設計は [docs/requirements.md](docs/requirements.md) を参照してください。

## 技術スタック

- Next.js (App Router) / TypeScript / Tailwind CSS
- Supabase (Postgres / Auth / Storage)
- Stripe (Payment Element / Billing / Webhook)

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local に Supabase / Stripe 等の値を設定
```

### Supabase

1. Supabaseプロジェクトを作成
2. `supabase/migrations/0001_init.sql` を実行してテーブルを作成
3. Authentication > Providers で Google OAuth を有効化
4. `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` を設定

### Stripe

1. `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` を設定
2. Webhookエンドポイント `/api/webhooks/stripe` を登録し、`STRIPE_WEBHOOK_SECRET` を設定
   (ローカル開発時は `stripe listen --forward-to localhost:3000/api/webhooks/stripe`)

### 開発サーバー起動

```bash
npm run dev
```

- 管理画面: http://localhost:3000/admin (Googleログイン、初回は権限なしで作成されるため、
  Supabaseの `users` テーブルで最初の1人を手動で `role='admin'` に更新してください)
- チャットウィジェット単体プレビュー: http://localhost:3000/widget
- 埋め込みスニペット: `public/widget.js`(スマレジEC・リピートの「デザインPC/デザインSP」等にscriptタグを追加)

## 現状の実装範囲(MVP)

- 商品登録・仕様情報登録・商品QA自動生成(要レビュー・公開)
- シナリオ登録(選択肢分岐、JSON編集ベースの簡易エディタ)
- チャットウィジェット(シナリオ実行、商品提示、決済、商品QA、問い合わせフォーム)
- 決済: Stripe(カード・Apple Pay/Google Pay、単発・定期)
- 後払い(スコアあと払い)・代金引換: 自社基幹システム連携はモック実装
  (`src/lib/adapters/core-system.ts`)
- スマレジ会員連携: モック実装(`src/lib/adapters/smaregi.ts`)。
  本番接続にはスマレジEC・リピートの「外部アプリ連携」で発行したクライアントID/シークレットが必要
- ユーザー権限: 管理者 / 一般ユーザーの2層(Googleログイン、自社ドメイン限定)

未確定事項・今後のステップは `docs/requirements.md` の該当セクションを参照してください。
