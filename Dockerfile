# syntax=docker/dockerfile:1

# Cloud Run向けのマルチステージビルド。
# 1) deps: 依存関係のインストールのみ(レイヤーキャッシュを効かせるため他のステージと分離)
# 2) builder: ビルド(NEXT_PUBLIC_*はビルド時にクライアントバンドルへ埋め込まれるため、ここでARG/ENVとして渡す)
# 3) runner: next.config.tsのoutput: "standalone"が生成する最小構成のみをコピーして実行

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_*はブラウザ側のクライアントバンドルに焼き込まれる値のため、
# 実行時ENVではなくビルド時の --build-arg で渡す必要がある。
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_ADMIN_ALLOWED_GOOGLE_DOMAIN
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_ADMIN_ALLOWED_GOOGLE_DOMAIN=$NEXT_PUBLIC_ADMIN_ALLOWED_GOOGLE_DOMAIN \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080
EXPOSE 8080

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# standaloneモードは実行に必要なnode_modulesの部分集合とサーバー本体(server.js)を含む
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

CMD ["node", "server.js"]
