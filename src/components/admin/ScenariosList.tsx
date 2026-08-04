"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface ScenarioRow {
  id: string;
  name: string;
  status: string;
}

export function ScenariosList({ initialScenarios }: { initialScenarios: ScenarioRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function handleRename(scenario: ScenarioRow) {
    const name = window.prompt("新しいシナリオ名を入力してください", scenario.name);
    if (!name || name === scenario.name) return;

    setPending(scenario.id);
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setPending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(`名称の変更に失敗しました: ${JSON.stringify(body.error ?? res.status)}`);
      return;
    }
    router.refresh();
  }

  async function handleDelete(scenario: ScenarioRow) {
    if (
      !window.confirm(`「${scenario.name}」を削除しますか？中のノードもすべて削除され、取り消せません。`)
    )
      return;

    setPending(scenario.id);
    const res = await fetch(`/api/scenarios/${scenario.id}`, { method: "DELETE" });
    setPending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(`削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {initialScenarios.map((scenario) => (
        <div
          key={scenario.id}
          className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:shadow-sm"
        >
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
          <div className="flex shrink-0 gap-3 text-sm">
            <button
              type="button"
              disabled={pending === scenario.id}
              onClick={() => handleRename(scenario)}
              className="text-blue-600 hover:underline disabled:opacity-30"
            >
              名前を編集
            </button>
            <button
              type="button"
              disabled={pending === scenario.id}
              onClick={() => handleDelete(scenario)}
              className="text-red-600 hover:underline disabled:opacity-30"
            >
              削除
            </button>
          </div>
        </div>
      ))}
      {initialScenarios.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
          シナリオが登録されていません
        </p>
      )}
    </div>
  );
}
