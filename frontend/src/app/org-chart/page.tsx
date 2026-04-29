"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Network, Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronRight,
  Building2, User, Phone, FileText,
} from "lucide-react";
import {
  getOrgChartNodes, createOrgChartNode, updateOrgChartNode, deleteOrgChartNode,
  getOrgChartStats,
} from "@/lib/api";
import {
  PageHeader, Card, Section, Stat, Button, Badge, Modal,
  Field, Input, Select, Textarea, CenterSpinner, EmptyState,
} from "@/components/ui";

interface OrgNode {
  id: number;
  parent_id: number | null;
  node_type: "department" | "person";
  name: string;
  position: string;
  department: string;
  employment_type: string;
  phone: string;
  memo: string;
  sort_order: number;
}

interface TreeNode extends OrgNode {
  children: TreeNode[];
}

const EMPLOYMENT_TYPES = ["정규직", "파견", "알바(사업소득)", "계약직", "인턴"];

function buildTree(nodes: OrgNode[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];
  for (const n of nodes) {
    map.set(n.id, { ...n, children: [] });
  }
  for (const n of nodes) {
    const treeNode = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }
  return roots;
}

function countPeople(node: TreeNode): number {
  let count = node.node_type === "person" ? 1 : 0;
  for (const child of node.children) {
    count += countPeople(child);
  }
  return count;
}

const EMPLOYMENT_TYPE_TONE: Record<string, "brand" | "warning" | "success" | "neutral"> = {
  "정규직": "brand",
  "파견": "warning",
  "알바(사업소득)": "success",
};

export default function OrgChartPage() {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingNode, setEditingNode] = useState<Partial<OrgNode> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getOrgChartStats();
      setStats(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchNodes = useCallback(async () => {
    try {
      const data = await getOrgChartNodes();
      setNodes(data);
      const deptIds = new Set(data.filter((n: OrgNode) => n.node_type === "department").map((n: OrgNode) => n.id));
      setExpandedIds(deptIds);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNodes(); fetchStats(); }, [fetchNodes, fetchStats]);

  const tree = useMemo(() => buildTree(nodes), [nodes]);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openCreate = (parentId: number | null, nodeType: "department" | "person") => {
    setEditingNode({
      parent_id: parentId,
      node_type: nodeType,
      name: "",
      position: "",
      department: "",
      employment_type: nodeType === "person" ? "정규직" : "",
      phone: "",
      memo: "",
      sort_order: 0,
    });
    setIsCreating(true);
  };

  const openEdit = (node: OrgNode) => {
    setEditingNode({ ...node });
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!editingNode?.name) return;
    setSaving(true);
    try {
      if (isCreating) {
        await createOrgChartNode(editingNode);
      } else {
        await updateOrgChartNode(editingNode.id!, editingNode);
      }
      setEditingNode(null);
      await fetchNodes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`"${name}"을(를) 삭제하시겠습니까? 하위 항목도 모두 삭제됩니다.`)) return;
    try {
      await deleteOrgChartNode(id);
      await fetchNodes();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const isDept = node.node_type === "department";
    const peopleCount = isDept ? countPeople(node) : 0;
    const empTone = EMPLOYMENT_TYPE_TONE[node.employment_type] ?? "neutral";

    return (
      <div key={node.id} style={{ marginLeft: depth * 24 }}>
        <div
          className={`flex items-center gap-2 px-3 py-2.5 rounded-[var(--r-md)] mb-1 group transition-colors ${
            isDept
              ? "bg-[var(--info-bg)] hover:bg-[var(--info-bg)]"
              : "bg-[var(--bg-1)] hover:bg-[var(--bg-2)] border border-[var(--border-1)]"
          }`}
        >
          {isDept && node.children.length > 0 ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="p-0.5 rounded hover:bg-[var(--bg-3)] text-[var(--brand-400)]"
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {isDept ? (
            <Building2 size={18} className="text-[var(--brand-400)] shrink-0" />
          ) : (
            <User size={18} className="text-[var(--text-3)] shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-medium ${isDept ? "text-[var(--brand-400)]" : "text-[var(--text-1)]"}`}>
                {node.name}
              </span>
              {node.position && (
                <Badge tone="neutral" size="xs">{node.position}</Badge>
              )}
              {node.employment_type && (
                <Badge tone={empTone} size="xs">{node.employment_type}</Badge>
              )}
              {isDept && (
                <span className="text-[var(--fs-caption)] text-[var(--brand-400)] opacity-70">({peopleCount}명)</span>
              )}
            </div>
            {(node.phone || node.memo) && (
              <div className="flex items-center gap-3 mt-0.5 text-[var(--fs-caption)] text-[var(--text-4)]">
                {node.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={10} />{node.phone}
                  </span>
                )}
                {node.memo && (
                  <span className="flex items-center gap-1">
                    <FileText size={10} />{node.memo}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isDept && (
              <>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => openCreate(node.id, "department")}
                  title="하위 부서 추가"
                  leadingIcon={<Building2 size={13} />}
                />
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => openCreate(node.id, "person")}
                  title="인원 추가"
                  leadingIcon={<Plus size={13} />}
                />
              </>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => openEdit(node)}
              title="수정"
              leadingIcon={<Edit2 size={13} />}
            />
            <Button
              variant="danger"
              size="xs"
              onClick={() => handleDelete(node.id, node.name)}
              title="삭제"
              leadingIcon={<Trash2 size={13} />}
            />
          </div>
        </div>

        {isDept && isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  const modalTitle = editingNode
    ? isCreating
      ? (editingNode.node_type === "department" ? "부서 추가" : "인원 추가")
      : (editingNode.node_type === "department" ? "부서 수정" : "인원 수정")
    : "";

  return (
    <>
      <PageHeader
        eyebrow="조직 관리"
        title="조직도"
        description="조직 구조를 관리하고 인원을 배치합니다."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openCreate(null, "person")}
              leadingIcon={<Plus size={14} />}
            >
              인원 추가
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openCreate(null, "department")}
              leadingIcon={<Building2 size={14} />}
            >
              부서 추가
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 p-4 rounded-[var(--r-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)] text-[var(--fs-body)]">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat label="전체 인원" value={String(stats.total)} unit="명" tone="brand" />
          {stats.byType?.slice(0, 3).map((t: any) => (
            <Stat
              key={t.employment_type}
              label={t.employment_type}
              value={String(t.count)}
              unit="명"
              tone={EMPLOYMENT_TYPE_TONE[t.employment_type] ?? "neutral"}
            />
          ))}
        </div>
      )}

      <Section title="조직 트리">
        {loading ? (
          <CenterSpinner />
        ) : tree.length === 0 ? (
          <EmptyState
            icon={<Network size={40} />}
            title="조직도가 비어있습니다."
            description="부서를 추가하여 시작하세요."
            action={
              <Button variant="primary" size="sm" onClick={() => openCreate(null, "department")}>
                첫 부서 추가하기
              </Button>
            }
          />
        ) : (
          <Card padding="sm">
            {tree.map(node => renderNode(node))}
          </Card>
        )}
      </Section>

      <Modal
        open={!!editingNode}
        onClose={() => setEditingNode(null)}
        title={modalTitle}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditingNode(null)}>취소</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!editingNode?.name}
              loading={saving}
              leadingIcon={<Save size={14} />}
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
          </>
        }
      >
        {editingNode && (
          <div className="space-y-4">
            <Field
              label={editingNode.node_type === "department" ? "부서명" : "이름"}
              required
            >
              <Input
                inputSize="md"
                value={editingNode.name || ""}
                onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })}
                placeholder={editingNode.node_type === "department" ? "부서명을 입력하세요" : "이름을 입력하세요"}
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="직위/직책">
                <Input
                  inputSize="md"
                  value={editingNode.position || ""}
                  onChange={(e) => setEditingNode({ ...editingNode, position: e.target.value })}
                  placeholder="예: 팀장, 반장"
                />
              </Field>
              {editingNode.node_type === "person" && (
                <Field label="고용형태">
                  <Select
                    inputSize="md"
                    value={editingNode.employment_type || ""}
                    onChange={(e) => setEditingNode({ ...editingNode, employment_type: e.target.value })}
                  >
                    <option value="">선택</option>
                    {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Field>
              )}
            </div>

            {editingNode.node_type === "person" && (
              <Field label="연락처">
                <Input
                  inputSize="md"
                  value={editingNode.phone || ""}
                  onChange={(e) => setEditingNode({ ...editingNode, phone: e.target.value })}
                  placeholder="010-0000-0000"
                />
              </Field>
            )}

            <Field label="메모">
              <Textarea
                value={editingNode.memo || ""}
                onChange={(e) => setEditingNode({ ...editingNode, memo: e.target.value })}
                rows={2}
                placeholder="참고 사항을 입력하세요"
              />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
