# スキーマ定義(Phase 2)

`schema.ts` / `relations.ts` は、`db/migrations/`配下のSQLをローカルのPostgreSQL 16に適用した状態へ
`drizzle-kit introspect`を実行して生成したものを、以下の点のみ手直ししています。

- 空文字列(`''::text`)をデフォルト値に持つ列で、生成コードが`.default(')`という壊れた構文になって
  いた6箇所(`email_templates`テーブル)を`.default("")`に修正。
- `subscriptions.orderId → orders.id → subscriptionItems.id → subscriptions.id`という3テーブル間の
  循環参照、および`orders.parentOrderId → orders.id`という自己参照について、TypeScriptの型推論が
  循環を解決できず`implicitly has type 'any'`エラーになっていたため、該当2列だけ
  `.references((): AnyPgColumn => ...)`という明示的な戻り値型付きの参照に変更(対応する
  テーブル末尾の`foreignKey({...})`ブロックは削除し、二重定義を避けている)。

それ以外はDrizzle標準の自動キャメルケース変換(例: `product_group_id` → `productGroupId`)を
そのまま採用しており、追加の手直しは行っていません。

スキーマを再生成する場合は、リポジトリルートで以下を実行してください(ローカルまたは
Cloud SQL Auth Proxy経由の接続先を`DATABASE_URL`で指定):

```bash
DATABASE_URL="postgresql://..." npx drizzle-kit introspect
```

生成物は`db/drizzle/`に出力されます(`.gitignore`済みの使い捨てディレクトリ)。
`db/drizzle/schema.ts`・`relations.ts`を、このディレクトリに上書きコピーしたうえで、
上記の手直し内容を再度適用してください。
