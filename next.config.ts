import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run等のコンテナ実行環境向けに、実行に必要な依存関係だけを含む
  // 最小構成(.next/standalone)を出力する。
  output: "standalone",
};

export default nextConfig;
