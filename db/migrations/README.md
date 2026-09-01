# Cloud SQL 移行用マイグレーション(Phase 1)

このディレクトリは、`supabase/migrations/`(Supabase運用時代の80本のマイグレーション)を
Google Cloud SQL (PostgreSQL) 向けに移植したものです。`supabase/migrations/`側は削除せず、
過去の履歴として残しています。

## `supabase/migrations/` からの変更点

1. **`0001_init.sql`**: `users.auth_user_id`列を、Supabase Authの`auth.users`テーブルへの外部キー
   (`uuid references auth.users(id) on delete cascade`)から、Firebase Authentication
   (Identity Platform)のUID文字列を保持するだけの単純な列(`text unique`)に変更しました。
   Cloud SQL側にはSupabaseの`auth.users`に相当するテーブルは存在しないため、外部キー制約は
   維持できず、また不要です。
2. **18ファイル(`alter table ... enable row level security;`を含んでいたファイル)**: 該当行を
   すべて削除しました。Supabase版ではRLSを有効化していましたが、ポリシーは一つも定義しておらず
   (サーバーAPIの単一DBロール経由のみでアクセスする設計)、Cloud SQL移行後もアプリ用の単一権限
   DBロールのみが接続する構成のため、RLSの有効化自体に意味がありません。
3. それ以外の79ファイルは無変更です(`pgcrypto`拡張・トリガー・関数・シーケンス・配列型・jsonb列は
   すべて標準的なPostgres機能で、Cloud SQLでもそのまま動作します)。

## Cloud SQLインスタンスの作成(要・実施者本人の作業)

この環境にはGCP認証情報がないため、以下のコマンドは**リポジトリの持ち主が実際のGCPプロジェクトで
実行してください**。プロジェクトID・リージョンは適宜置き換えます。

```bash
# 1. Cloud SQL for PostgreSQL インスタンスを作成(低コスト優先の最小構成)
gcloud sql instances create pm-chat-bot-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=asia-northeast1 \
  --storage-size=10GB \
  --storage-auto-increase

# 2. データベースを作成
gcloud sql databases create pm_chat_bot --instance=pm-chat-bot-db

# 3. アプリ用の最小権限ロールを作成(superuserは使わない)
gcloud sql users create app_user --instance=pm-chat-bot-db --password=<強力なパスワード>

# 4. インスタンス接続名を控える(Cloud SQL Connectorの CLOUD_SQL_INSTANCE_CONNECTION_NAME に使用)
gcloud sql instances describe pm-chat-bot-db --format="value(connectionName)"
```

## マイグレーションの適用

このリポジトリには専用のマイグレーションランナーはなく(Supabase時代から手動適用の運用でした)、
ファイル名の連番順に`psql`で流し込むだけです。ローカルからCloud SQL Auth Proxy経由で接続するか、
Cloud Shellから直接接続してください。

```bash
# Cloud SQL Auth Proxy経由でローカルの5432番ポートに接続している前提
for f in db/migrations/*.sql; do
  echo "applying $f"
  psql "host=127.0.0.1 port=5432 dbname=pm_chat_bot user=app_user sslmode=disable" -v ON_ERROR_STOP=1 -f "$f"
done
```

`ON_ERROR_STOP=1`により、途中のファイルでエラーが出た場合はそこで停止します。

## 未実施の作業(このPhaseの範囲外)

- 実際のCloud SQLインスタンス作成・マイグレーション適用の実行(上記コマンドは実施者が実行)
- Drizzle ORMの導入・スキーマ定義(Phase 2)
- アプリコードからの接続(Phase 3以降)

`supabase/migrations/`ディレクトリは、Supabase運用中の履歴として当面残します。Phase 7で
Supabase関連の依存関係・環境変数を削除する際に、あわせて削除するかどうかを判断してください。
