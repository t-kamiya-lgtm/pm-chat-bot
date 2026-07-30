# チャットボット決済システム 要件定義書 / 基本設計書

## 1. 概要

スマレジEC上にポップアップ表示するチャットボットで、商品提案から決済(単発・定期)、
スマレジECへの会員情報連携までを完結させるシステムを構築する。
商品・トークシナリオは管理画面から登録でき、管理者と一般ユーザーで権限を分ける。

- 対象サイト: スマレジEC(埋め込みポップアップウィジェット)
- 決済: Stripe(カード, Apple Pay/Google Pay)
- 将来対応: LINE公式アカウント連携、コンビニ払い/PayPay

## 2. スコープ

### MVP範囲
- チャネル: Web埋め込みポップアップウィジェットのみ(LINEは次フェーズ)
- 決済手段: カード決済(Stripe Payment Element) + Apple Pay/Google Pay
- 定期注文: Stripe Billingによるカード定期課金のみ
- シナリオ: 選択肢分岐型トークフロー(管理画面でノーコード作成)
- 商品登録: チャットボット内に商品マスタを保持し、スマレジ商品IDで紐付け(連携は当面モック)
- 会員情報移行: 決済完了後、スマレジ会員登録I/Fへ連携(当面モック実装、メールアドレスで名寄せ)
- ユーザー権限: 管理者 / 一般ユーザー(商品・シナリオ登録可)の2層
- 管理画面ログイン: Googleログイン(自社ドメイン限定)

### 次フェーズ以降(MVP対象外)
- LINE公式アカウント連携
- コンビニ払い・PayPay等の決済手段追加
- コンビニ払い/PayPay定期注文と基幹システムの後払い与信フローとの連携
- AIによる自由対話接客

### 未確定事項(要確認・モックで進行)
| 項目 | 内容 | 対応方針 |
|---|---|---|
| スマレジ・プラットフォームAPI | 利用契約・APIキー取得状況が未確認 | インターフェースを定義しモック実装。契約確定後に接続 |
| 基幹システムの後払い与信フロー | 定期注文の与信・請求を基幹システムが担っている可能性 | 本システムは初回受注データ連携までを担う想定で仮設計。仕様確認後に確定 |
| コンビニ払い/PayPayの定期注文対応範囲 | 自動課金不可のため運用方式が未確定 | MVPでは対象外とし、次フェーズで再設計 |

## 3. システム構成

```
[利用者ブラウザ]
   └─ スマレジECページに埋め込み(JSスニペット)
        └─ チャットウィジェット(Next.js / iframe)
             ├─ シナリオ実行エンジン(選択肢分岐)
             ├─ Stripe Payment Element(決済)
             └─ Stripe Billing(定期課金)
                     │
                     ▼
        [バックエンド (Next.js API Routes / Vercel)]
             ├─ 商品・シナリオ管理API
             ├─ 注文・会員データ管理
             ├─ Stripe Webhook受信 → 注文確定処理
             ├─ スマレジ連携アダプタ (モック → 本実装)
             └─ 基幹システム連携アダプタ (モック → 本実装)
                     │
                     ▼
        [Supabase (Postgres / Auth / Storage)]

[管理画面 (Next.js, Googleログイン)]
   ├─ 商品登録・編集
   ├─ シナリオ登録・編集
   ├─ 注文・会員一覧
   └─ ユーザー権限管理(管理者のみ)
```

## 4. 機能要件

### 4.1 チャットウィジェット
- スマレジECの商品ページ等にJSスニペットで埋め込み、ポップアップ表示/最小化ができる
- シナリオに沿って選択肢を提示し、商品提案・購入導線を表示
- 商品詳細(画像・価格・説明)をチャット内カード形式で表示
- 単発購入 / 定期購入(周期選択: 例 2週間・1ヶ月・2ヶ月)を選べる
- Stripe Payment Elementをチャット内に埋め込み、離脱せず決済完了
- 決済結果(成功/失敗)をチャット内に表示

### 4.2 決済・定期注文
- 単発注文: Stripe PaymentIntentで都度決済
- 定期注文: Stripe Billing(Subscription)で作成し、以後の周期課金はStripeが自動実行
- Stripe Webhook(`payment_intent.succeeded`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated/deleted` 等)を受信し、注文・サブスク状態をDBに反映
- 定期注文の一覧・次回課金日・停止/解約は管理画面またはチャット上のマイページ導線から確認可能(MVPでは管理画面のみ)

### 4.3 会員情報移行
- 決済完了時に以下をスマレジ連携アダプタ経由で送信(モック実装。本番はスマレジAPI)
  - 基本情報: 氏名・メールアドレス・電話番号・住所
  - 注文履歴・購入商品
  - 定期注文情報: 周期・次回発送予定日・ステータス
- 既存会員判定: メールアドレス一致で既存スマレジ会員と紐付け。一致しない場合は新規会員として登録

### 4.4 商品登録機能(管理画面)
- 商品名・説明・価格・画像・スマレジ商品ID(紐付け用)・定期注文可否・周期選択肢を登録
- Stripe Price/Productの作成・同期(単発用Price, 定期用Price)

### 4.5 シナリオ登録機能(管理画面)
- ノードベースの選択肢分岐フローを作成
  - ノード種別: メッセージ表示 / 選択肢分岐 / 商品提示 / 決済導線への遷移
- シナリオの公開・下書き・バージョン管理
- 商品登録機能と連携し、シナリオ内で紐付けた商品をチャットに表示

### 4.6 ユーザー権限管理
- 管理者: 全機能(ユーザー管理含む)
- 一般ユーザー: 商品登録・シナリオ登録のみ(ユーザー管理・システム設定は不可)
- Googleログイン(自社ドメイン制限)。初回ログイン時は権限なし状態で作成され、管理者が権限付与

## 5. データモデル(主要テーブル、概略)

- `users` : id, email, role(admin/staff), created_at
- `products` : id, name, description, price, image_url, smaregi_product_id(nullable),
  is_subscription_available, subscription_intervals(jsonb), stripe_product_id, stripe_price_id
- `scenarios` : id, name, status(draft/published), version, created_by
- `scenario_nodes` : id, scenario_id, type(message/choice/product/checkout), content(jsonb), next_node_map(jsonb)
- `customers` : id, email, name, phone, address(jsonb), smaregi_member_id(nullable), stripe_customer_id
- `orders` : id, customer_id, product_id, type(one_time/subscription), amount, status,
  stripe_payment_intent_id, stripe_subscription_id
- `subscriptions` : id, order_id, interval, next_billing_date, status(active/paused/canceled)
- `smaregi_sync_logs` : id, order_id, payload(jsonb), status, error(nullable) — モック連携の送信ログ

## 6. 外部連携インターフェース(モック定義)

### 6.1 スマレジ連携アダプタ
```
interface SmaregiAdapter {
  findMemberByEmail(email: string): Promise<SmaregiMember | null>
  createMember(input: MemberInput): Promise<SmaregiMember>
  syncOrder(memberId: string, order: OrderInput): Promise<void>
  getProduct(smaregiProductId: string): Promise<SmaregiProduct | null>
}
```
MVPでは `MockSmaregiAdapter` を実装し、DB内に疑似レスポンスを保存。
本番接続時は同インターフェースを満たす `SmaregiApiAdapter` に差し替える。

### 6.2 基幹システム連携アダプタ
```
interface CoreSystemAdapter {
  submitSubscriptionOrder(order: SubscriptionOrderInput): Promise<{ accepted: boolean }>
}
```
定期注文の与信・後払い請求フローの仕様確定後にI/Fを見直す前提のプレースホルダー。

## 7. 非機能要件
- 決済情報(カード番号等)は自社サーバーで保持せず、Stripeに委譲(PCI DSS SAQ A準拠)
- Stripe Webhookは署名検証を実施
- 管理画面アクセスはGoogleログイン + 自社ドメイン制限 + ロールベースアクセス制御
- 個人情報(氏名・住所等)は保管時に必要最小限のアクセス制御(Supabase RLS)を設定

## 8. 技術スタック
- フロントエンド/バックエンド: Next.js(App Router), Vercelホスティング
- DB/認証/ストレージ: Supabase(Postgres, Auth, Storage)
- 決済: Stripe(Payment Element, Billing, Webhook)
- リポジトリ: GitHub

## 9. 今後のステップ
1. スマレジ・プラットフォームAPI利用契約・APIキー取得状況の確認
2. 基幹システムの定期注文与信・後払い請求フロー仕様のヒアリング
3. 上記確定後、スマレジ/基幹システム連携アダプタの本実装
4. MVP実装(管理画面・チャットウィジェット・Stripe連携)
