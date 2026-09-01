# Firebase Authentication (Identity Platform) 構築(Phase 4)

この環境にはGCP/Firebaseの認証情報がないため、以下は**実施者本人がFirebase/GCPコンソールまたは
`gcloud`/`firebase` CLIで実行してください**。

## 1. Firebaseプロジェクトの準備

Cloud SQL・Cloud Runと同じGCPプロジェクトに対して、Firebase Authenticationを有効化します。

```bash
# 既にFirebase CLIがインストール・ログイン済みの前提
firebase projects:addfirebase <既存のGCPプロジェクトID>
```

または[Firebaseコンソール](https://console.firebase.google.com/)から既存のGCPプロジェクトを選択し、
「Authentication」を有効化してください。

## 2. Googleログインプロバイダの有効化

Firebaseコンソール > Authentication > Sign-in method から「Google」を有効化します
(現行のSupabase版と同じく、Googleログインのみで、パスワード・その他プロバイダは有効化不要)。

## 3. クライアント設定値の取得

Firebaseコンソール > プロジェクトの設定 > 全般 > マイアプリ > SDK の設定と構成 から、
以下の値を確認し、`.env`(本番はCloud Runの環境変数、ローカルは`.env.local`)に設定してください。
これらは秘匿情報ではありません(`NEXT_PUBLIC_*`としてクライアントバンドルに埋め込まれます)。

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`

## 4. Cloud Runサービスアカウントへの権限付与

`firebase-admin`(サーバー側)はCloud Runの実行時サービスアカウントのADC
(Application Default Credentials)で認証するため、手動での鍵ファイル発行は不要です。
Cloud Runサービスの実行時サービスアカウントに、以下のIAMロールを付与してください。

```bash
gcloud projects add-iam-policy-binding <GCPプロジェクトID> \
  --member="serviceAccount:<Cloud Runサービスアカウントのメールアドレス>" \
  --role="roles/firebaseauth.admin"
```

`FIREBASE_PROJECT_ID`環境変数にはGCPプロジェクトIDを設定してください
(Cloud Run上ではADCから自動検出されますが、未設定時のエラーメッセージが分かりにくいため
明示指定を推奨します)。

## この環境で検証済みのこと

実際のFirebaseプロジェクトがないため、`POST /api/auth/session`・`DELETE /api/auth/session`を
ローカルの`next dev`サーバーに対して実際にHTTPリクエストで検証し、以下を確認しました。

- `idToken`未指定 → 400(日本語エラーメッセージ)
- 不正な`idToken`(Firebase認証情報がない状態) → 例外がcatchされ401(サーバーがクラッシュしない)
- `DELETE` → Cookieが正しくクリアされる(`Set-Cookie`ヘッダーで有効期限切れの値が返る)

実際のGoogleログイン→セッションCookie発行という正常系のフローは、Firebaseプロジェクト構築後に
実施者側で検証が必要です。
