// 통합 SSO 자동 전환 로그인 (static export). 하이드레이션 의존을 없애기 위해
// HTML 인라인 스크립트로 즉시 리다이렉트한다(브라우저가 HTML 파싱 즉시 실행 — JS 청크/하이드레이션 불필요).
const REDIRECT_JS = `(function(){try{var u="https://auth.nuldam.com/authorize?app=aisystem&return="+encodeURIComponent("https://aisystem.nuldam.com/sso");window.location.replace(u);}catch(e){window.location.href="https://auth.nuldam.com/authorize?app=aisystem&return=https%3A%2F%2Faisystem.nuldam.com%2Fsso";}})();`;

export default function LoginPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: REDIRECT_JS }} />
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
            잠시 후 자동으로 이동합니다. 이동되지 않으면{" "}
            <a
              href="https://auth.nuldam.com/authorize?app=aisystem&return=https%3A%2F%2Faisystem.nuldam.com%2Fsso"
              style={{ color: "#60a5fa" }}
            >
              여기를 클릭
            </a>
            하세요.
          </p>
        </div>
        <style>{`@keyframes nuldamspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  );
}
