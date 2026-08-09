"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

export interface ScenarioRow {
  id: string;
  name: string;
  status: string;
  displayOrder: number;
}

export function ScenariosList({ initialScenarios }: { initialScenarios: ScenarioRow[] }) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState(initialScenarios);
  const [pending, setPending] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= scenarios.length) return;

    const current = scenarios[index];
    const target = scenarios[targetIndex];
    const next = [...scenarios];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setScenarios(next);

    setPending(current.id);
    await Promise.all([
      fetch(`/api/scenarios/${current.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayOrder: target.displayOrder }),
      }),
      fetch(`/api/scenarios/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayOrder: current.displayOrder }),
      }),
    ]);
    setPending(null);
    router.refresh();
  }

  function startEdit(scenario: ScenarioRow) {
    setEditingId(scenario.id);
    setEditValue(scenario.name);
    setError(null);
  }

  async function handleRename(scenario: ScenarioRow) {
    const name = editValue.trim();
    if (!name || name === scenario.name) {
      setEditingId(null);
      return;
    }

    setPending(scenario.id);
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setPending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(`名称の変更に失敗しました: ${JSON.stringify(body.error ?? res.status)}`);
      return;
    }
    setScenarios((prev) => prev.map((s) => (s.id === scenario.id ? { ...s, name } : s)));
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(scenario: ScenarioRow) {
    setPending(scenario.id);
    const res = await fetch(`/api/scenarios/${scenario.id}`, { method: "DELETE" });
    setPending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(`削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`);
      return;
    }
    setScenarios((prev) => prev.filter((s) => s.id !== scenario.id));
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {scenarios.map((scenario, index) => (
        <div
          key={scenario.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-4 hover:shadow-sm"
        >
          <div className="mr-3 flex shrink-0 gap-1">
            <button
              type="button"
              disabled={pending !== null || index === 0}
              onClick={() => move(index, -1)}
              className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={pending !== null || index === scenarios.length - 1}
              onClick={() => move(index, 1)}
              className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
            >
              ▼
            </button>
          </div>
          {editingId === scenario.id ? (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="input flex-1"
              />
              <button
                type="button"
                disabled={pending === scenario.id}
                onClick={() => handleRename(scenario)}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <Link href={`/admin/scenarios/${scenario.id}`} className="flex flex-1 items-center gap-3">
              <span>{scenario.name}</span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  scenario.status === "published"
                    ? "bg-green-100 text-green-800"
                    : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {scenario.status === "published" ? "公開中" : "下書き"}
              </span>
            </Link>
          )}
          {editingId !== scenario.id && (
            <div className="flex shrink-0 gap-3 text-sm">
              <button
                type="button"
                disabled={pending === scenario.id}
                onClick={() => startEdit(scenario)}
                className="text-blue-600 hover:underline disabled:opacity-30"
              >
                名前を編集
              </button>
              <ConfirmButton
                label="削除"
                confirmLabel="中のノードもすべて削除されます。よろしいですか？"
                disabled={pending === scenario.id}
                onConfirm={() => handleDelete(scenario)}
              />
            </div>
          )}
        </div>
      ))}
      {scenarios.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
          シナリオが登録されていません
        </p>
      )}
    </div>
  );
}
