import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 이미지 최소화 — node_modules 없이 실행 가능
  output: "standalone",

  // standalone tracing 이 ioredis 의 `built/*.js` 를 누락하는 사고를 막는다.
  // server-only Redis client 라 webpack bundle 대신 외부 require 로 두면
  // nft(node-file-trace) 가 패키지 전체를 통째로 복사한다.
  serverExternalPackages: ["ioredis"],

  // dev: LAN IP(모바일 테스트) + localhost.
  // prod: BETTER_AUTH_URL(이 앱의 공개 주소) 호스트도 허용 — reverse proxy 뒤에서 nginx 가
  //   x-forwarded-host 를 upstream alias 로 잘못 set 할 때 server action 거부
  //   방지. nginx 설정에서 'proxy_set_header X-Forwarded-Host $host;' 명시도
  //   같이 권장.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "127.0.0.1:3000",
        "192.168.*.*:3000",
        "10.*.*.*:3000",
        "172.16.*.*:3000",
        ...(process.env.BETTER_AUTH_URL
          ? [new URL(process.env.BETTER_AUTH_URL).host]
          : []),
      ],
    },
  },

  // dev 서버를 LAN 모든 인터페이스에서 받게 — webpack-hmr ws 도 같은 host 로.
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
  ],

  // dev 한정 same-origin 우회.
  //
  // MinIO 는 Chrome PNA(Private Network Access) 가 요구하는
  // `Access-Control-Allow-Private-Network: true` 헤더를 보낼 옵션이 없어서
  // localhost:3000 → localhost:19000 PUT 이 브라우저에서 막힌다.
  //
  // presigned URL 의 host 를 same-origin(`/_minio/...`) 으로 잡고
  // 여기서 진짜 MinIO 로 proxy 하면 CORS/PNA 모두 우회된다.
  //
  // 운영(별도 S3 도메인)에서는 이 rewrite 불필요 — boto3 endpoint 만 분기.
  async rewrites() {
    const minio = process.env.MINIO_PROXY_TARGET ?? "http://localhost:19000"
    return [
      {
        source: "/_minio/:path*",
        destination: `${minio}/:path*`,
      },
    ]
  },
};

export default nextConfig;
