import type { NextConfig } from "next";

const BASE_PATH = '/HR';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: BASE_PATH,
  trailingSlash: true,          // 정적 export 시 /login/ → login/index.html 생성 → 404 방지
  images: { unoptimized: true }, // 정적 export 필수
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH, // api.ts 등에서 basePath 참조용
  },
};

export default nextConfig;
