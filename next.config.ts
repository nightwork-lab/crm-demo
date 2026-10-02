import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', 'playwright-core'],

  // serverExternalPackages は「バンドルしない」だけで、ファイルトレースは止まらない。
  // happ 同期は Vercel では実行できない（app-mode.ts の SYNC_READONLY_MESSAGE）ため、
  // playwright 一式が本番の /sync 関数に載っても一度も使われない。明示的に除外する。
  // data/backups はローカル専用（.gitignore 済み）。ローカルのトレースを軽くするために併記。
  outputFileTracingExcludes: {
    '/sync': [
      'node_modules/playwright/**',
      'node_modules/playwright-core/**',
    ],
    '*': [
      'data/backups/**',
    ],
  },
};

export default nextConfig;
