"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product, Scenario, ScenarioNode, ScenarioNodeType } from "@/lib/types";

const NODE_TYPE_LABELS: Record<ScenarioNodeType, string> = {
  message: "メッセージ表示",
  choice: "選択肢分岐",
  product: "商品提示",
  checkout: "決済導線",
  product_qa: "商品QA",
};

interface Props {
  scenario: Scenario;
  nodes: ScenarioNode[];
  products: Pick<Product, "id" | "name">[];
}

export function ScenarioEditor({ scenario, nodes, products }: Props) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [newNodeType, setNewNodeType] = useState<ScenarioNodeType>("message");
  const [newNodeContent, setNewNodeContent] = useState("{}");
  const [newNodeNextMap, setNewNodeNextMap] = useState("{}");
  const [newNodeIsEntry, setNewNodeIsEntry] = useState(nodes.length === 0);
  const [error, setError] = useState<string | null>(null);

  async function togglePublish() {
    setPublishing(true);
    await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: scenario.status === "published" ? "draft" : "published" }),
    });
    setPublishing(false);
    router.refresh();
  }

  async function handleAddNode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    let content: Record<string, unknown>;
    let nextNodeMap: Record<string, string>;
    try {
      content = JSON.parse(newNodeContent || "{}");
      nextNodeMap = JSON.parse(newNodeNextMap || "{}");
    } catch {
      setError("content / nextNodeMap はJSON形式で入力してください");
      return;
    }

    const res = await fetch(`/api/scenarios/${scenario.id}/nodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: newNodeType,
        content,
        nextNodeMap,
        isEntry: newNodeIsEntry,
      }),
    });

    if (!res.ok) {
      setError("ノードの追加に失敗しました");
      return;
    }

    setNewNodeContent("{}");
    setNewNodeNextMap("{}");
    setNewNodeIsEntry(false);
    router.refresh();
  }

  async function handleDeleteNode(nodeId: string) {
    if (!window.confirm("このノードを削除しますか？")) return;
    await fetch(`/api/scenarios/${scenario.id}/nodes/${nodeId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{scenario.name}</h1>
        <button
          type="button"
          onClick={togglePublish}
          disabled={publishing}
          className={`rounded-md px-4 py-2 text-sm text-white disabled:opacity-50 ${
            scenario.status === "published"
              ? "bg-neutral-500 hover:bg-neutral-600"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {scenario.status === "published" ? "下書きに戻す" : "公開する"}
        </button>
      </div>

      {products.length === 0 && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          商品が登録されていません。「商品提示」「決済導線」「商品QA」ノードで参照する場合は先に商品を登録してください。
        </p>
      )}

      <div className="mb-8 space-y-3">
        {nodes.map((node) => (
          <div key={node.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
                {NODE_TYPE_LABELS[node.type]}
                {node.isEntry && " ・開始ノード"}
              </span>
              <button
                type="button"
                onClick={() => handleDeleteNode(node.id)}
                className="text-xs text-red-600 hover:underline"
              >
                削除
              </button>
            </div>
            <pre className="overflow-x-auto rounded bg-neutral-50 p-2 text-xs">
              content: {JSON.stringify(node.content)}
            </pre>
            <pre className="mt-1 overflow-x-auto rounded bg-neutral-50 p-2 text-xs">
              nextNodeMap: {JSON.stringify(node.nextNodeMap)}
            </pre>
          </div>
        ))}
        {nodes.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
            ノードがまだありません
          </p>
        )}
      </div>

      <form onSubmit={handleAddNode} className="max-w-xl space-y-4 border-t border-neutral-200 pt-6">
        <h2 className="text-lg font-medium">ノードを追加</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">ノード種別</span>
          <select
            className="input"
            value={newNodeType}
            onChange={(e) => setNewNodeType(e.target.value as ScenarioNodeType)}
          >
            {(Object.keys(NODE_TYPE_LABELS) as ScenarioNodeType[]).map((type) => (
              <option key={type} value={type}>
                {NODE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs text-neutral-500">
          商品ID一覧(product/checkout/product_qaノードのcontentで
          {" "}
          {"{\"productId\": \"...\"}"} として指定):
          {" "}
          {products.map((p) => `${p.name}=${p.id}`).join(", ") || "商品なし"}
        </p>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">
            content(JSON。例: message→{"{\"text\": \"こんにちは\"}"} / choice→
            {"{\"text\": \"どちらにしますか\", \"options\": [{\"label\": \"A\", \"value\": \"a\"}]}"})
          </span>
          <textarea
            className="input font-mono"
            rows={3}
            value={newNodeContent}
            onChange={(e) => setNewNodeContent(e.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">
            nextNodeMap(JSON。例: {"{\"a\": \"次のノードID\"}"}、常に次に進む場合は
            {" "}
            {"{\"default\": \"次のノードID\"}"})
          </span>
          <textarea
            className="input font-mono"
            rows={2}
            value={newNodeNextMap}
            onChange={(e) => setNewNodeNextMap(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={newNodeIsEntry}
            onChange={(e) => setNewNodeIsEntry(e.target.checked)}
          />
          このノードを開始ノードにする
        </label>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          ノードを追加
        </button>
      </form>
    </div>
  );
}
