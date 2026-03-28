"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ShieldAlert, Lock, Check } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function PasswordManagePage() {
  const { user, token } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);

  const isAuthorized = user?.email === 'lion9080@joinandjoin.com';

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/regular/admin-password`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setHasPassword(d.has_password))
      .catch(() => {});
  }, [token]);

  const handleSave = async () => {
    if (password !== confirmPassword) return alert("비밀번호가 일치하지 않습니다.");
    if (password.length < 4) return alert("4자리 이상 입력해주세요.");
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/regular/admin-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      alert("비밀번호가 설정되었습니다.");
      setHasPassword(true); setPassword(""); setConfirmPassword("");
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  if (!isAuthorized) {
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-center py-20">
          <div className="bg-white rounded-xl border border-red-200 p-8 max-w-sm text-center">
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900">접근 제한</h2>
            <p className="text-sm text-gray-600 mt-2">lion9080@joinandjoin.com 계정만 접근 가능합니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Lock className="w-6 h-6 text-blue-600" />
          비밀번호 관리
        </h1>
        <p className="text-sm text-gray-500 mt-1">근로계약서 열람/발송 시 사용되는 비밀번호를 설정합니다.</p>
      </div>

      <div className="max-w-md">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">현재 상태:</span>
            {hasPassword ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium"><Check size={12} /> 설정됨</span>
            ) : (
              <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full text-xs font-medium">미설정</span>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="4자리 이상" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="다시 입력" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button onClick={handleSave} disabled={saving || !password}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:bg-gray-300 hover:bg-blue-700">
            {saving ? '저장 중...' : hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
          </button>
        </div>
      </div>
    </div>
  );
}
