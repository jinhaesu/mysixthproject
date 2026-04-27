"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ShieldAlert, Lock, Check } from "lucide-react";
import {
  PageHeader, Card, CardHeader, Section, Button, Badge, Field, Input, useToast,
} from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function PasswordManagePage() {
  const toast = useToast();
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
    if (password !== confirmPassword) return toast.error("비밀번호가 일치하지 않습니다.");
    if (password.length < 4) return toast.error("4자리 이상 입력해주세요.");
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/regular/admin-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      toast.success("비밀번호가 설정되었습니다.");
      setHasPassword(true); setPassword(""); setConfirmPassword("");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card padding="lg" className="max-w-sm w-full border-[var(--danger-border)] bg-[var(--danger-bg)] text-center">
          <ShieldAlert className="w-10 h-10 text-[var(--danger-fg)] mx-auto mb-3" />
          <h2 className="text-[var(--fs-h4)] font-semibold text-[var(--text-1)]">접근 제한</h2>
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-2">
            lion9080@joinandjoin.com 계정만 접근 가능합니다.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="시스템"
        title="비밀번호 관리"
        description="근로계약서 열람/발송 시 사용되는 비밀번호를 설정합니다."
      />

      <div className="max-w-md">
        <Card padding="lg">
          <CardHeader
            title="관리자 비밀번호"
            subtitle="열람 보호에 사용됩니다."
            actions={
              hasPassword
                ? <Badge tone="success" dot><Check size={10} className="inline mr-0.5" />설정됨</Badge>
                : <Badge tone="danger">미설정</Badge>
            }
          />

          <div className="mt-5 space-y-4">
            <Field label="새 비밀번호" required>
              <Input
                type="password"
                inputSize="md"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="4자리 이상"
              />
            </Field>

            <Field label="비밀번호 확인" required>
              <Input
                type="password"
                inputSize="md"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="다시 입력"
              />
            </Field>

            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={handleSave}
              loading={saving}
              disabled={saving || !password}
              leadingIcon={<Lock size={15} />}
            >
              {saving ? '저장 중...' : hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
