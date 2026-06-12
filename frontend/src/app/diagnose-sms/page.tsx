'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function DiagnoseSmsPage() {
  const [name, setName] = useState('김종성');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

  async function run() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(
        `${API_URL}/api/regular/contracts/diagnose?name=${encodeURIComponent(name)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(e.message || '호출 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 20, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>SMS 발송 진단</h1>
      <p style={{ color: '#666', marginBottom: 20 }}>
        근로계약서 SMS 발송 row 와 SMS provider 설정을 한 번에 확인합니다.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="직원 이름"
          style={{ flex: 1, padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
        />
        <button
          onClick={run}
          disabled={loading || !name.trim()}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 14,
          }}
        >
          {loading ? '조회 중…' : '진단'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fee', color: '#c00', borderRadius: 4, marginBottom: 16 }}>
          에러: {error}
        </div>
      )}

      {result && (
        <>
          <div style={{ padding: 16, background: '#f0f9ff', borderRadius: 6, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>환경 설정</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, fontSize: 14 }}>
              <div style={{ color: '#666' }}>SMS_PROVIDER</div>
              <div>
                <strong style={{ color: result.sms_provider === 'solapi' ? '#16a34a' : '#dc2626' }}>
                  {result.sms_provider}
                </strong>
                {result.sms_provider !== 'solapi' && (
                  <span style={{ marginLeft: 8, color: '#dc2626' }}>
                    ← mock 이면 실제 발송 안 됨! Railway env 추가 필요
                  </span>
                )}
              </div>
              <div style={{ color: '#666' }}>SOLAPI 설정</div>
              <div>
                <strong style={{ color: result.solapi_configured ? '#16a34a' : '#dc2626' }}>
                  {result.solapi_configured ? '완료 (3개 env 모두 있음)' : '누락'}
                </strong>
              </div>
              <div style={{ color: '#666' }}>발신번호 (마스킹)</div>
              <div>{result.solapi_sender || '(없음)'}</div>
            </div>
          </div>

          <h2 style={{ fontSize: 16, marginBottom: 8 }}>계약서 row ({result.contracts?.length || 0}개)</h2>
          {result.contracts && result.contracts.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={th}>ID</th>
                  <th style={th}>발송 phone</th>
                  <th style={th}>master phone</th>
                  <th style={th}>계약기간</th>
                  <th style={th}>status</th>
                  <th style={th}>sms_sent</th>
                  <th style={th}>created_at</th>
                </tr>
              </thead>
              <tbody>
                {result.contracts.map((c: any) => (
                  <tr key={c.id}>
                    <td style={td}>{c.id}</td>
                    <td style={td}>{c.phone}</td>
                    <td style={td}>{c.employee_phone_master}</td>
                    <td style={td}>
                      {c.contract_start} ~ {c.contract_end}
                    </td>
                    <td style={td}>{c.status}</td>
                    <td style={{ ...td, color: c.sms_sent ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>
                      {c.sms_sent ? '✓ 1 (발송 성공)' : '✗ 0 (미발송/실패)'}
                    </td>
                    <td style={td}>{c.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 16, background: '#fefce8', color: '#854d0e', borderRadius: 4 }}>
              해당 이름으로 발송된 계약서 row 가 없습니다. INSERT 자체가 실패했거나 이름 매칭이 안 되는 경우.
            </div>
          )}

          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', color: '#666', fontSize: 13 }}>Raw JSON</summary>
            <pre style={{ background: '#f9fafb', padding: 12, borderRadius: 4, fontSize: 12, overflow: 'auto' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  borderBottom: '1px solid #e5e7eb',
  fontWeight: 600,
};
const td: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #f3f4f6',
};
