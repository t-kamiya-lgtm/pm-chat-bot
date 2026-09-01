# Cloud Run デプロイ手順(Phase 8)

この環境にはGCP認証情報がないため、以下のコマンドは**リポジトリの持ち主が実際のGCPプロジェクトで
実行してください**。プロジェクトID・リージョン・サービス名は適宜置き換えます。

`Dockerfile`は既にCloud Run向けのマルチステージ構成(standalone出力、ポート8080、非rootユーザー)
になっているため、コード側の変更は`ARG`/`ENV`ブロック(`NEXT_PUBLIC_FIREBASE_*`)のみで、
デプロイ自体は`gcloud run deploy --source .`が既存のDockerfileを自動的に使ってCloud Buildで
ビルド・デプロイします。

## 1. Cloud Runサービスアカウントへの権限付与

Cloud RunのランタイムサービスアカウントにCloud SQL・Firebase Authへのアクセス権限を付与します
(初回デプロイ前に実施)。

```bash
gcloud projects add-iam-policy-binding <GCPプロジェクトID> \
  --member="serviceAccount:<Cloud Runランタイムサービスアカウント>" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding <GCPプロジェクトID> \
  --member="serviceAccount:<Cloud Runランタイムサービスアカウント>" \
  --role="roles/firebaseauth.admin"
```

## 2. デプロイ

`NEXT_PUBLIC_*`はビルド時にクライアントバンドルへ焼き込まれるため`--build-arg`相当の
`--set-build-env-vars`(または`gcloud builds submit`との組み合わせ)で、それ以外(Cloud SQL接続情報・
Stripeシークレット等)は実行時の`--set-env-vars`/`--set-secrets`で渡します。

```bash
gcloud run deploy pm-chat-bot \
  --source . \
  --region asia-northeast1 \
  --add-cloudsql-instances <CLOUD_SQL_INSTANCE_CONNECTION_NAME> \
  --set-env-vars CLOUD_SQL_INSTANCE_CONNECTION_NAME=<...>,DB_USER=<...>,DB_NAME=<...>,FIREBASE_PROJECT_ID=<...>,ADMIN_ALLOWED_GOOGLE_DOMAIN=<...>,NEXT_PUBLIC_SITE_URL=<...>,ORDER_EMAIL_FROM=<...> \
  --set-secrets DB_PASSWORD=<Secret Managerのシークレット名>:latest,STRIPE_SECRET_KEY=<...>:latest,STRIPE_WEBHOOK_SECRET=<...>:latest,CRON_SECRET=<...>:latest
```

`.env.example`に列挙されている環境変数のうち、`NEXT_PUBLIC_*`はビルド時に、それ以外は
実行時に設定してください(値はSecret Managerでの管理を推奨)。

## 未実施の作業(このPhaseの範囲外)

- 実際の`gcloud run deploy`の実行(上記コマンドは実施者が実行)
- Cloud Schedulerによるcronジョブの置き換え(Phase 9)
- 移行前後の動作検証(Phase 10)
