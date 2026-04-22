"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Network, Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronRight,
  Building2, User, Phone, FileText, Users,
} from "lucide-react";
import {
  getOrgChartNodes, createOrgChartNode, updateOrgChartNode, deleteOrgChartNode,
  getOrgChartStats,
} from "@/lib/api";

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
      // Auto-expand all departments
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

    return (
      <div key={node.id} style={{ marginLeft: depth * 24 }}>
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg mb-1 group transition-colors ${
          isDept ? "bg-[#4EA7FC]/10 hover:bg-[#4EA7FC]/15" : "bg-[#0F1011] hover:bg-[#141516]/5 border border-[#23252A]"
        }`}>
          {isDept && node.children.length > 0 ? (
            <button onClick={() => toggleExpand(node.id)} className="p-0.5 hover:bg-blue-200 rounded">
              {isExpanded ? <ChevronDown size={16} className="text-[#7070FF]" /> : <ChevronRight size={16} className="text-[#7070FF]" />}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {isDept ? (
            <Building2 size={18} className="text-[#7070FF] shrink-0" />
          ) : (
            <User size={18} className="text-[#8A8F98] shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${isDept ? "text-[#4EA7FC]" : "text-[#F7F8F8]"}`}>{node.name}</span>
              {node.position && <span className="text-xs text-[#8A8F98] bg-[#141516] px-1.5 py-0.5 rounded">{node.position}</span>}
              {node.employment_type && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  node.employment_type === "정규직" ? "bg-[#4EA7FC]/15 text-[#828FFF]" :
                  node.employment_type === "파견" ? "bg-[#FC7840]/15 text-[#FC7840]" :
                  node.employment_type.includes("알바") ? "bg-[#27A644]/15 text-[#27A644]" :
                  "bg-[#141516] text-[#8A8F98]"
                }`}>{node.employment_type}</span>
              )}
              {isDept && <span className="text-xs text-blue-500">({peopleCount}명)</span>}
            </div>
            {(node.phone || node.memo) && (
              <div className="flex items-center gap-3 mt-0.5 text-xs text-[#62666D]">
                {node.phone && <span className="flex items-center gap-1"><Phone size={10} />{node.phone}</span>}
                {node.memo && <span className="flex items-center gap-1"><FileText size={10} />{node.memo}</span>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isDept && (
              <>
                <button onClick={() => openCreate(node.id, "department")} className="p-1.5 text-blue-500 hover:bg-blue-200 rounded" title="하위 부서 추가">
                  <Building2 size={14} />
                </button>
                <button onClick={() => openCreate(node.id, "person")} className="p-1.5 text-green-500 hover:bg-[#27A644]/15 rounded" title="인원 추가">
                  <Plus size={14} />
                </button>
              </>
            )}
            <button onClick={() => openEdit(node)} className="p-1.5 text-[#62666D] hover:bg-[#141516]/7 rounded" title="수정">
              <Edit2 size={14} />
            </button>
            <button onClick={() => handleDelete(node.id, node.name)} className="p-1.5 text-red-400 hover:bg-[#EB5757]/15 rounded" title="삭제">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {isDept && isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#F7F8F8]">조직도</h2>
          <p className="text-[#8A8F98] mt-1">조직 구조를 관리하고 인원을 배치합니다.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openCreate(null, "department")}
            className="flex items-center gap-2 bg-[#5E6AD2] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#828FFF] transition-colors"
          >
            <Building2 size={16} />
            부서 추가
          </button>
          <button
            onClick={() => openCreate(null, "person")}
            className="flex items-center gap-2 bg-[#1C1C1F] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#141516]/5 transition-colors"
          >
            <Plus size={16} />
            인원 추가
          </button>
        </div>
      </div>

      {error && <div className="bg-[#EB5757]/10 border border-[#EB5757]/30 rounded-xl p-4 text-[#EB5757] text-sm mb-4">{error}</div>}

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-4 text-center">
            <p className="text-2xl font-bold text-[#F7F8F8]">{stats.total}</p>
            <p className="text-xs text-[#8A8F98] mt-1">전체 인원</p>
          </div>
          {stats.byType?.slice(0, 3).map((t: any) => (
            <div key={t.employment_type} className="bg-[#0F1011] rounded-xl border border-[#23252A] p-4 text-center">
              <p className="text-2xl font-bold text-[#7070FF]">{t.count}</p>
              <p className="text-xs text-[#8A8F98] mt-1">{t.employment_type}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tree View */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-[#5E6AD2]/30 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : tree.length === 0 ? (
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-12 text-center">
          <Network size={48} className="mx-auto text-[#62666D] mb-4" />
          <p className="text-[#8A8F98] mb-4">조직도가 비어있습니다. 부서를 추가하여 시작하세요.</p>
          <button
            onClick={() => openCreate(null, "department")}
            className="bg-[#5E6AD2] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#828FFF]"
          >
            첫 부서 추가하기
          </button>
        </div>
      ) : (
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-4">
          {tree.map(node => renderNode(node))}
        </div>
      )}

      {/* Edit/Create Modal */}
      {editingNode && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F1011] rounded-2xl shadow-[0px_7px_32px_rgba(0,0,0,0.35)] w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#23252A]">
              <h3 className="text-lg font-semibold text-[#F7F8F8]">
                {isCreating
                  ? (editingNode.node_type === "department" ? "부서 추가" : "인원 추가")
                  : (editingNode.node_type === "department" ? "부서 수정" : "인원 수정")
                }
              </h3>
              <button onClick={() => setEditingNode(null)} className="p-2 hover:bg-[#141516]/5 rounded-lg">
                <X size={20} className="text-[#8A8F98]" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                  {editingNode.node_type === "department" ? "부서명" : "이름"} *
                </label>
                <input
                  type="text"
                  value={editingNode.name || ""}
                  onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })}
                  className="w-full border border-[#23252A] rounded-lg px-3 py-2.5 text-sm text-[#F7F8F8]"
                  placeholder={editingNode.node_type === "department" ? "부서명을 입력하세요" : "이름을 입력하세요"}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">직위/직책</label>
                  <input
                    type="text"
                    value={editingNode.position || ""}
                    onChange={(e) => setEditingNode({ ...editingNode, position: e.target.value })}
                    className="w-full border border-[#23252A] rounded-lg px-3 py-2.5 text-sm text-[#F7F8F8]"
                    placeholder="예: 팀장, 반장"
                  />
                </div>
                {editingNode.node_type === "person" && (
                  <div>
                    <label className="block text-sm font-medium text-[#D0D6E0] mb-1">고용형태</label>
                    <select
                      value={editingNode.employment_type || ""}
                      onChange={(e) => setEditingNode({ ...editingNode, employment_type: e.target.value })}
                      className="w-full border border-[#23252A] rounded-lg px-3 py-2.5 text-sm text-[#F7F8F8]"
                    >
                      <option value="">선택</option>
                      {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {editingNode.node_type === "person" && (
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">연락처</label>
                  <input
                    type="text"
                    value={editingNode.phone || ""}
                    onChange={(e) => setEditingNode({ ...editingNode, phone: e.target.value })}
                    className="w-full border border-[#23252A] rounded-lg px-3 py-2.5 text-sm text-[#F7F8F8]"
                    placeholder="010-0000-0000"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#D0D6E0] mb-1">메모</label>
                <textarea
                  value={editingNode.memo || ""}
                  onChange={(e) => setEditingNode({ ...editingNode, memo: e.target.value })}
                  className="w-full border border-[#23252A] rounded-lg px-3 py-2.5 text-sm text-[#F7F8F8]"
                  rows={2}
                  placeholder="참고 사항을 입력하세요"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#23252A] bg-[#08090A] rounded-b-2xl">
              <button onClick={() => setEditingNode(null)} className="px-4 py-2 text-sm font-medium text-[#8A8F98] hover:bg-[#141516]/7 rounded-lg">
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={!editingNode.name || saving}
                className="flex items-center gap-2 bg-[#5E6AD2] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#828FFF] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
