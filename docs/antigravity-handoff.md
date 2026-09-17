# 引き継ぎ書: primedirect.jp連携の本番接続・実データ確認(antigravity向け)

このドキュメントは、Claude Code(この開発サンドボックス)側で実装が完了しているものの、
**実際のGoogle Cloud/Firebase/primedirect.jp環境へのアクセス権限がないため実行できない作業**を、
実環境での操作権限を持つ側(antigravity)に引き継ぐためのものです。

対象ブランチ/PR: `t-kamiya-lgtm/pm-chat-bot` リポジトリ、ブランチ`claude/primedirect-api-foundations`
(PR #168)。マージ前でも、このブランチをチェックアウトして作業を進めて構いません。

## 前提: このPRで実装済みのこと(コードのみ、未実行)

- primedirect.jp API v2(顧客API・受注API・定期申込API)の型付きクライアント
  (`src/lib/adapters/smaregi-customer-api.ts` / `src/lib/adapters/smaregi-order-api.ts`)
- Stripe決済・代引き・後払いのいずれの注文確定時にも、primedirect.jp受注APIへ連携する処理
  (`src/lib/primedirect-order-sync.ts`)。`customer_id: -1`によるメールアドレス自動名寄せを使う
- 新規会員登録時の仮パスワード発行・会員登録完了メール送信
- 管理画面「スマレジ連携」ページ(`/admin/smaregi`)に、直近の連携ログ一覧を追加

**現状、これらは一度も実際のprimedirect.jp APIに対して実行されていません**(このサンドボックスに
実クレデンシャルがないため)。コード内の一部の値(`payment_id`・`payment_status`・`ec_type`等)は
未確認のプレースホルダのままです。

## 引き継ぐ作業

### 1. primedirect.jpの外部アプリ連携(OAuth2)を登録する

1. primedirect.jp(スマレジEC・リピート)の管理画面にログインし、「基本設定 > 外部アプリ連携」を開く
2. アプリケーション名を登録し、リダイレクトURLに以下を設定する
   ```
   <本番サイトのURL>/api/smaregi/callback
   ```
   (`<本番サイトのURL>`は環境変数`NEXT_PUBLIC_SITE_URL`と同じ値にする必要がある)
3. 発行されたクライアントID/シークレットIDを控える

### 2. 本番環境変数を設定してデプロイする

このPRをマージ(または直接ブランチをデプロイ)し、`docs/deploy.md`の手順に加えて以下を設定する。

```
SMAREGI_DOMAIN=www.primedirect.jp
SMAREGI_CLIENT_ID=<1で発行されたクライアントID>
SMAREGI_CLIENT_SECRET=<1で発行されたシークレットID>
NEXT_PUBLIC_PRIMEDIRECT_LOGIN_URL=<primedirect.jpの実際のログインページURL。未確認の場合は
  いったん https://www.primedirect.jp/mypage のままでよい(4.6.1参照。要確認)>
```

`SMAREGI_CLIENT_ID`/`SMAREGI_CLIENT_SECRET`は秘匿情報のため、Secret Manager経由で渡すことを推奨
(`STRIPE_SECRET_KEY`等と同様の扱い)。

### 3. OAuth連携を完了する

デプロイ後、管理画面(`/admin/smaregi`)を開き、「連携する」ボタンからOAuth認可を完了する。
「接続状態: 連携済み」と表示されれば成功。

### 4. 実際のAPI値を確認する(最優先)

管理画面限定の調査用エンドポイント `/api/admin/smaregi/debug-orders` (GET) を呼び出し、
実際の受注データから以下の値を確認する。

- `payment_id`(支払方法ID): カード・後払い(単品/定期)・代引きそれぞれの実際の値
  (`src/lib/primedirect-order-sync.ts`では暫定的にカード=77, 代引き=4, 後払い=44を使用中。
  旧実装`smaregi-order-sync.ts`(廃止済み、`git show de81b37^:src/lib/smaregi-order-sync.ts`で
  全文参照可)の実績値を踏襲しているが、現在の契約でも同じ値かは要確認)
- `payment_status`(決済ステータス): 「決済済み」に相当する具体的な値
  (現在コード内は暫定値`1`を使用。これが最重要の未確認事項)
- `order_status`/`order_status_name`(受注ステータス): マスタに一致する名称
  (現在コード内は`"受付"`という暫定値)
- `deliv_id`/`deliv_method`(配送方法): 有効な値
- `hasso_deliv_kbn`(配送区分): 有効な値
- `order_root`(販売ルートID): 有効な値
- `ec_type`(EC種類): 契約側で有効な値

確認できた値を`src/lib/primedirect-order-sync.ts`内の該当箇所(コード中に`// 要確認:`という
コメントを付けてある)に反映する。この反映作業自体はClaude Codeでも対応可能なので、
確認できた値のリストだけ共有してもらえれば、コード修正はこちら(Claude)で行える。

### 5. 「代引き」自体への対応可否を確認する

primedirect.jp開発者サポート、またはスマレジ側の契約内容で、「代引き(配送時現金回収)」自体が
受注APIで対応しているかを確認する。対応していない場合、代引き注文の連携は失敗し続けるのが
正常な状態になる(既存の基幹システム連携が引き続き使われるため、業務への支障はない)。

### 6. 少額のテスト注文で動作確認する

サンドボックス環境がないため(`docs/verification.md`と同様の方針)、本番相当の環境で
自社宛の少額テスト注文を作成し、即キャンセル/返金する形で安全に検証する。

- Stripeの単発注文 → `/admin/smaregi`のログ一覧で`status: ok`になることを確認
- 代引き・後払いの単発注文 → 同上
- 定期購入(Stripe・代引き/後払いそれぞれ) → 初回受注が同様に成功することを確認。
  代引き・後払いの場合は、primedirect.jp側の管理画面で`periodical_order`(定期申込)が
  正しく作成され、初回/2回目以降の価格が意図通り(初回特別価格→2回目以降通常価格)に
  設定されているかも確認する

### 7. 会員登録完了メールの実際の送信確認

新規顧客のテスト注文後、`customers`テーブルの当該顧客に仮パスワードが設定され、
会員登録完了メールが実際に届くかを確認する(`GAS_MAIL_WEBHOOK_URL`/`GAS_MAIL_SECRET`が
本番で設定済みであることが前提)。

## 完了後、Claude Codeへ引き継いでほしいこと

上記4〜7で確認できた実際の値・動作結果を共有してもらえれば、以下をClaude Code側で対応する。

- `src/lib/primedirect-order-sync.ts`のプレースホルダ値を実値に更新
- 代引きが未対応と分かった場合、代引き注文の連携を意図的にスキップする(または基幹システム
  連携のみに戻す)分岐の追加
- ここまでの本番接続確認が取れた後で初めて着手すべき大きな作業(チャット側DBからの個人情報
  実データの削除、`customer-detail.ts`等のprimedirect.jp API経由への置き換え)の設計・実装

## 参考ドキュメント

- `docs/requirements.md` 6.1節・9節: 現在の実装状況のまとめ
- `docs/deploy.md`: Cloud Runデプロイ手順全体
- `t-kamiya-lgtm/new-chatbot`リポジトリ`docs/smaregi-cart-handoff-research.md`: 調査・設計判断の経緯
