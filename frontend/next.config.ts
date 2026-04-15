import type { NextConfig } from "next";

const BASE_PATH = '/attendance';

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
  // output: 'export' 제거 — Vercel이 Next.js 네이티브 라우팅 사용.
  // 정적 export는 F5(새로고침) 시 404 발생 (서버 라우팅 없음).
  // Vercel은 Next.js를 자체 지원하므로 export 없이 배포 가능.
};

export default nextConfig;
