"use client";

// 통합 SSO 자동 전환 로그인 (static export).
// useEffect 로 즉시 허브로 리다이렉트(시크릿에서 검증된 방식). 혹시 안 되면 수동 링크 제공.
// /login 은 vercel.json 에서 no-store 로 캐시 방지.
import { useEffect } from "react";

const HUB_URL =
  "https://auth.nuldam.com/authorize?app=aisystem&return=" +
  encodeURIComponent("https://aisystem.nuldam.com/sso");

export default function LoginPage() {
  useEffect(() => {
    window.location.replace(HUB_URL);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            margin: "0 auto 16px",
            border: "3px solid rgba(255,255,255,0.2)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            animation: "nuldamspin 0.8s linear infinite",
          }}
        />
        <p style={{ fontSize: 15 }}>회사 계정 로그인으로 이동 중...</p>
        <p style={{ fontSize: 12, color: "#a1a1aa", marginTop: 8 }}>
          이동되지 않으면{" "}
          <a href={HUB_URL} style={{ color: "#60a5fa" }}>
            여기를 클릭
          </a>
          하세요.
        </p>
      </div>
      <style>{`@keyframes nuldamspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
