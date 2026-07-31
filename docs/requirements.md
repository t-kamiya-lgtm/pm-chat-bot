# チャットボット決済システム 要件定義書 / 基本設計書

## 1. 概要

スマレジEC上にポップアップ表示するチャットボットで、商品提案から決済(単発・定期)、
スマレジECへの会員情報連携までを完結させるシステムを構築する。
商品・トークシナリオは管理画面から登録でき、管理者と一般ユーザーで権限を分ける。

- 対象サイト: スマレジEC(埋め込みポップアップウィジェット)
- 即時決済: Stripe(カード, Apple Pay/Google Pay, PayPayは申請・審査中)
- 後払い(コンビニ払い等)・代金引換: Stripeでは扱わず、自社基幹システムを利用。
  チャットボットは与信・請求・代引金額の徴収を行わず、顧客情報・注文内容を基幹システムに連携するのみ
- 将来対応: LINE公式アカウント連携

## 2. スコープ

### MVP範囲
- チャネル: Web埋め込みポップアップウィジェットのみ(LINEは次フェーズ)
- 即時決済手段: カード決済(Stripe Payment Element) + Apple Pay/Google Pay。PayPayは申請中(追加情報提出済み、Stripe審査完了後に有効化)
- 後払い(コンビニ払い等): Stripeでは扱わず、自社基幹システムの「スコアあと払い」を利用。チャットボットは基幹システム連携アダプタ経由で顧客情報・注文内容を連携するのみで、与信・請求は基幹システムが担当
- 代金引換: 自社基幹システムを利用(単発・定期両方に適用)。チャットボットは商品代金+代引手数料の合計金額を表示し、代引手数料の徴収・配送業者への連携は基幹システムが担当
- 定期注文: カード決済分はStripe Billingで自動課金。後払い(スコアあと払い)・代金引換による定期注文は基幹システム側で継続管理
- シナリオ: 選択肢分岐型トークフロー(管理画面でノーコード作成)
- 商品登録: チャットボット内に商品マスタを保持し、スマレジ商品IDで紐付け(連携は当面モック)
- 会員情報移行: 決済完了後、スマレジ会員登録I/Fへ連携(当面モック実装、メールアドレスで名寄せ)
- ユーザー権限: 管理者 / 一般ユーザー(商品・シナリオ登録可)の2層
- 管理画面ログイン: Googleログイン(自社ドメイン限定)
- 商品QA: 商品仕様情報からQAを事前生成し管理画面でレビューした上で公開。ユーザーはFAQ一覧からの選択のみ(自由入力なし)、該当がなければチャット内埋め込みの問い合わせフォームへ

### 次フェーズ以降(MVP対象外)
- LINE公式アカウント連携
- 楽天ペイ(対応断念)、Amazon Pay(現時点で不要。必要になれば再検討)
- AIによる自由対話接客

### 未確定事項(要確認・モックで進行)
| 項目 | 内容 | 対応方針 |
|---|---|---|
| スマレジEC・リピートAPI連携 | 実装未着手(契約・アプリ登録は確認済み。詳細なAPI仕様の読み込みが必要) | スマレジEC・リピート管理画面の「外部アプリ連携」でチャットボット用アプリを新規登録し、OAuth2のクライアントID/シークレットIDを発行して本実装に着手 |
| 基幹システム(スコアあと払い・代金引換)連携仕様 | 顧客情報・注文内容の連携方法(API有無、データ形式)が未確認 | 本システムは注文データ連携までを担う想定で仮設計。仕様確認後にI/Fを確定 |
| StripeアカウントのPayPay審査状況 | 追加情報提出済み、Stripe側の審査完了待ち | 承認され次第、決済手段として有効化。MVP実装はPayPay有無どちらでも動くよう設計 |
| Stripeアカウントのレビュー(本人確認)状況 | ダッシュボード上で「レビュー中(2〜3日)」表示中 | 本番リリース前に完了しているか要確認 |

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
                  ※後払い(スコアあと払い)・代金引換の注文は与信・請求・代引金額の徴収を行わず、
                    顧客情報・注文内容を渡すのみ
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
- 支払い方法として「即時決済(カード等)」「後払い」「代金引換」を選択できる
- 即時決済を選んだ場合: Stripe Payment Elementをチャット内に埋め込み、離脱せず決済完了
- 後払いを選んだ場合: カード情報入力は行わず、商品代金と後払い手数料を分けて明示した上で合計金額を表示し、会員情報・注文内容を基幹システムへ連携(与信結果・請求書発行は基幹システム側の後続処理)
- 代金引換を選んだ場合: カード情報入力は行わず、商品代金と代引手数料を分けて明示した上で合計金額を表示し、会員情報・注文内容を基幹システムへ連携(配送時の代金徴収は基幹システム・配送業者側の後続処理)
- 手数料が発生する支払い方法(後払い・代金引換)の金額表示フォーマット:
  ```
  商品代金 3,000円
  ○○手数料 330円(税込)
  ─────────────
  合計 3,330円
  ```
- 決済結果/受付結果(成功/失敗)をチャット内に表示

### 4.2 決済・定期注文

#### 即時決済(Stripe)
- 単発注文: Stripe PaymentIntentで都度決済(カード, Apple Pay/Google Pay。PayPayは審査完了後に追加)
- 定期注文: Stripe Billing(Subscription)で作成し、以後の周期課金はStripeが自動実行
- Stripe Webhook(`payment_intent.succeeded`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated/deleted` 等)を受信し、注文・サブスク状態をDBに反映
- 定期注文の一覧・次回課金日・停止/解約は管理画面またはチャット上のマイページ導線から確認可能(MVPでは管理画面のみ)

#### 後払い(スコアあと払い: 郵便局・コンビニ後払い)
- 手数料: 単発注文 550円(税込)、定期購入商品 220円(税込)。`payment_method_fees`テーブルから
  `payment_method=deferred_invoice` かつ注文タイプ(one_time/subscription)に応じた金額を取得し、
  商品代金と分けてチャット上に明示した上で合計金額を表示する
- 本システムでは与信・請求処理を行わない。チャットボットは顧客情報・注文内容(単発/定期の別、商品、周期等)を
  基幹システム連携アダプタ経由で連携するのみ
- 与信結果・請求書発行・入金確認・定期注文の継続課金判断はすべて基幹システムが担当する
- チャット上には「基幹システムへ注文を受け付けた」旨を表示し、以降の請求案内は基幹システム側のフロー(郵送/メール等)に委ねる

#### 代金引換
- 手数料: 330円(税込)の固定額(注文金額・単発/定期を問わず一律)。`payment_method_fees`テーブルから
  `payment_method=cod` の金額を取得し、商品代金と分けてチャット上に明示した上で合計金額を表示する
- 与信は不要。顧客情報・注文内容を基幹システム連携アダプタ経由で連携する
- 単発注文・定期注文どちらにも適用可能。定期注文の場合、発送のたびに代引手数料が発生する前提で、次回発送分の
  金額案内も基幹システム側の運用に委ねる
- 実際の代金徴収(配送員による集金・配送業者への手数料精算)は基幹システム・配送業者側の後続処理とする

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

### 4.7 商品QA機能
- 商品ごとに詳細仕様情報(原材料・アレルギー・容量・使い方等)を管理画面から登録できる
- 商品登録・仕様情報の登録/更新をトリガーに、LLMでQ&A候補をバッチ生成する
- 生成されたQ&A候補は「下書き」状態で保存され、管理画面で内容確認・修正・却下を行った上で公開する(未レビューのQAはチャットに表示しない)
- チャット上でのアクセス経路は2通り
  - シナリオ内の1ノード種別として「商品QA」を配置し、シナリオ作成者が任意の分岐先に組み込める
  - シナリオの進行状況によらず常時表示されるメニューから直接アクセスできる
- ユーザーは公開済みFAQの一覧からタップして選択する方式のみ(自由入力は受け付けない)
- 該当するFAQがない場合は、一覧内の「その他のご質問」等の選択肢からチャット内埋め込みの問い合わせフォームに遷移する
- 問い合わせフォーム: チャットを離脱せずに入力(氏名・メールアドレス・問い合わせ内容等)。送信されるとDB保存は行わず、指定の担当者メールアドレスへ通知メールを送信するのみ(管理画面での一覧確認は対象外)

## 5. データモデル(主要テーブル、概略)

- `users` : id, email, role(admin/staff), created_at
- `products` : id, name, description, price, image_url, smaregi_product_id(nullable),
  is_subscription_available, subscription_intervals(jsonb), stripe_product_id, stripe_price_id
- `payment_method_fees` : id, payment_method(cod/deferred_invoice), order_type(one_time/subscription/nullable=共通),
  fee — 決済手段別の手数料。初期値: cod=330円(単発・定期共通), deferred_invoice=550円(単発)/220円(定期)
- `product_specs` : id, product_id, ingredients(原材料), allergens(アレルギー), volume(容量), usage(使い方), その他仕様(jsonb)
- `product_faqs` : id, product_id, question, answer, status(draft/published/rejected), source(generated/manual), generated_from_spec_id, reviewed_by, reviewed_at
- 問い合わせフォームの内容はDBに永続化せず、受信後にメール送信APIへ渡してそのまま担当者へ通知する(テーブルなし)
- `scenarios` : id, name, status(draft/published), version, created_by
- `scenario_nodes` : id, scenario_id, type(message/choice/product/checkout/product_qa), content(jsonb), next_node_map(jsonb)
- `customers` : id, email, name, phone, address(jsonb), smaregi_member_id(nullable), stripe_customer_id
- `orders` : id, customer_id, product_id, type(one_time/subscription), payment_method(stripe/deferred_invoice/cod),
  amount, fee(nullable) — 後払い/代引手数料, status, stripe_payment_intent_id(nullable), stripe_subscription_id(nullable)
- `subscriptions` : id, order_id, interval, next_billing_date, status(active/paused/canceled)
- `smaregi_sync_logs` : id, order_id, payload(jsonb), status, error(nullable) — モック連携の送信ログ

## 6. 外部連携インターフェース(モック定義)

### 6.1 スマレジ連携アダプタ(スマレジEC・リピートAPI)
```
interface SmaregiAdapter {
  findMemberByEmail(email: string): Promise<SmaregiMember | null>
  createMember(input: MemberInput): Promise<SmaregiMember>
  syncOrder(memberId: string, order: OrderInput): Promise<void>
  getProduct(smaregiProductId: string): Promise<SmaregiProduct | null>
}
```
連携先は「スマレジ・プラットフォームAPI」(スマレジ本体のPOS/アプリマーケット向けAPI)ではなく、
契約中の**スマレジEC・リピート**が提供する専用API(スマレジEC・リピートAPI)。
利用は無料で、スマレジEC・リピート管理画面の「ショップ基本設定 > 外部アプリ連携」からアプリケーション名・
リダイレクトURLを登録すると、OAuth2のクライアントID/シークレットIDが発行される(契約・アプリ登録経路は確認済み)。
MVPでは `MockSmaregiAdapter` を実装し、DB内に疑似レスポンスを保存。
本番接続時は同インターフェースを満たす `SmaregiApiAdapter` に差し替える。

### 6.2 基幹システム連携アダプタ(スコアあと払い・代金引換)
```
interface CoreSystemAdapter {
  submitOrder(order: CoreSystemOrderInput): Promise<{ accepted: boolean }>
}

interface CoreSystemOrderInput {
  customer: { name: string; email: string; phone: string; address: Address }
  orderType: "one_time" | "subscription"
  paymentMethod: "deferred_invoice" | "cod" // deferred_invoice = スコアあと払い、cod = 代金引換
  product: { id: string; quantity: number }
  subscriptionInterval?: string // orderType が subscription の場合のみ
  amount: number
  fee: number // paymentMethod・orderTypeに応じてpayment_method_feesから算出した手数料
}
```
- `deferred_invoice`: 与信判定・請求書発行・入金確認・定期注文の継続課金はすべて基幹システム側の責務
- `cod`: 与信は不要。代引金額(商品代金+代引手数料)の徴収・配送業者への手数料精算は基幹システム・配送業者側の責務
- 本システムは `submitOrder` で注文データを渡すところまでを担う。
連携方式(REST API/ファイル連携等)は基幹システムの仕様確認後に確定する前提のプレースホルダー。

### 6.3 商品QA生成(LLM連携)
```
interface ProductQaGenerator {
  generateCandidates(productId: string, spec: ProductSpec): Promise<QaCandidate[]>
}
```
商品情報・仕様情報の登録/更新をトリガーに呼び出し、生成結果は `product_faqs` に `draft` として保存する。
管理画面でのレビュー(承認/修正/却下)を経て `published` になったもののみチャットに表示する。

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
1. スマレジEC・リピート管理画面の「外部アプリ連携」でチャットボット用アプリを新規登録し、クライアントID/シークレットIDを発行
2. スマレジEC・リピートAPI仕様(会員登録・注文連携・商品情報取得エンドポイント)の詳細確認
3. 基幹システム(スコアあと払い・代金引換)への注文データ連携方式(API有無、データ形式)のヒアリング
4. StripeアカウントのPayPay審査完了、および本人確認(アカウントレビュー)完了の確認
5. 上記確定後、スマレジ/基幹システム連携アダプタの本実装
6. MVP実装(管理画面・チャットウィジェット・Stripe連携)
