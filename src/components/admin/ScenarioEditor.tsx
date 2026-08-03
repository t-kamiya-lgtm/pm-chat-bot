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

const ORDER_TYPE_LABELS: Record<string, string> = {
  one_time: "単品",
  subscription: "定期",
};

type PickableProduct = Pick<Product, "id" | "name" | "price" | "orderType"> & {
  productGroupId: string | null;
  productGroupName: string | null;
};

const UNGROUPED_KEY = "__ungrouped__";

function productLabel(product: PickableProduct) {
  return `${product.name}(${ORDER_TYPE_LABELS[product.orderType] ?? product.orderType} ・ ${product.price.toLocaleString()}円)`;
}

/** product/checkout/product_qaノードは商品IDをJSONで手打ちする代わりに品番選択で設定する。 */
function usesProductPicker(type: ScenarioNodeType) {
  return type === "product" || type === "checkout" || type === "product_qa";
}

function extractProductIds(content: Record<string, unknown>): string[] {
  if (Array.isArray(content.productIds)) return content.productIds as string[];
  if (typeof content.productId === "string") return [content.productId];
  return [];
}

function ProductPicker({
  type,
  products,
  selectedIds,
  onChange,
}: {
  type: ScenarioNodeType;
  products: PickableProduct[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const groups = Array.from(
    new Map(
      products.map((p) => [
        p.productGroupId ?? UNGROUPED_KEY,
        { id: p.productGroupId ?? UNGROUPED_KEY, name: p.productGroupName ?? "未分類" },
      ]),
    ).values(),
  );

  const [selectedGroupId, setSelectedGroupId] = useState(() => {
    const firstSelected = products.find((p) => selectedIds.includes(p.id));
    return firstSelected ? (firstSelected.productGroupId ?? UNGROUPED_KEY) : (groups[0]?.id ?? "");
  });

  if (products.length === 0) {
    return <p className="text-xs text-amber-700">商品が登録されていません。先に品番を登録してください。</p>;
  }

  const productsInGroup = products.filter(
    (p) => (p.productGroupId ?? UNGROUPED_KEY) === selectedGroupId,
  );

  return (
    <div className="space-y-2">
      <select
        className="input w-auto"
        value={selectedGroupId}
        onChange={(e) => setSelectedGroupId(e.target.value)}
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>

      {type === "product" ? (
        <div className="space-y-1 rounded-md border border-neutral-200 p-3">
          {productsInGroup.map((product) => (
            <label key={product.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.includes(product.id)}
                onChange={(e) => {
                  if (e.target.checked) onChange([...selectedIds, product.id]);
                  else onChange(selectedIds.filter((id) => id !== product.id));
                }}
              />
              {productLabel(product)}
            </label>
          ))}
          {productsInGroup.length === 0 && (
            <p className="text-xs text-neutral-400">この商品種類には品番が登録されていません</p>
          )}
        </div>
      ) : (
        <select
          className="input"
          value={selectedIds.find((id) => productsInGroup.some((p) => p.id === id)) ?? ""}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
        >
          <option value="">品番を選択してください</option>
          {productsInGroup.map((product) => (
            <option key={product.id} value={product.id}>
              {productLabel(product)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

interface Props {
  scenario: Scenario;
  nodes: ScenarioNode[];
  products: PickableProduct[];
}

export function ScenarioEditor({ scenario, nodes, products }: Props) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [newNodeType, setNewNodeType] = useState<ScenarioNodeType>("message");
  const [newNodeContent, setNewNodeContent] = useState("{}");
  const [newNodeProductIds, setNewNodeProductIds] = useState<string[]>([]);
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
      if (usesProductPicker(newNodeType)) {
        content =
          newNodeType === "product"
            ? { productIds: newNodeProductIds }
            : { productId: newNodeProductIds[0] };
      } else {
        content = JSON.parse(newNodeContent || "{}");
      }
      nextNodeMap = JSON.parse(newNodeNextMap || "{}");
    } catch {
      setError("content / nextNodeMap はJSON形式で入力してください");
      return;
    }

    if (usesProductPicker(newNodeType) && newNodeProductIds.length === 0) {
      setError("品番を1つ以上選択してください");
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
    setNewNodeProductIds([]);
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
          <NodeCard
            key={node.id}
            scenarioId={scenario.id}
            node={node}
            products={products}
            onDelete={() => handleDeleteNode(node.id)}
          />
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

        {usesProductPicker(newNodeType) ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              品番{newNodeType === "product" ? "(複数選択でカルーセル表示)" : "(1件選択)"}
            </span>
            <ProductPicker
              type={newNodeType}
              products={products}
              selectedIds={newNodeProductIds}
              onChange={setNewNodeProductIds}
            />
          </label>
        ) : null}

        {!usesProductPicker(newNodeType) && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              content(JSON。例: message→{"{\"text\": \"こんにちは\"}"}(画像も表示する場合は
              {" "}
              {"{\"text\": \"こんにちは\", \"imageUrl\": \"https://...\"}"}) / choice→
              {"{\"text\": \"どちらにしますか\", \"options\": [{\"label\": \"A\", \"value\": \"a\"}]}"})
            </span>
            <textarea
              className="input font-mono"
              rows={3}
              value={newNodeContent}
              onChange={(e) => setNewNodeContent(e.target.value)}
            />
          </label>
        )}

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

function NodeCard({
  scenarioId,
  node,
  products,
  onDelete,
}: {
  scenarioId: string;
  node: ScenarioNode;
  products: PickableProduct[];
  onDelete: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [contentText, setContentText] = useState(JSON.stringify(node.content));
  const [productIds, setProductIds] = useState<string[]>(extractProductIds(node.content));
  const [nextMapText, setNextMapText] = useState(JSON.stringify(node.nextNodeMap));
  const [isEntry, setIsEntry] = useState(node.isEntry);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setContentText(JSON.stringify(node.content));
    setProductIds(extractProductIds(node.content));
    setNextMapText(JSON.stringify(node.nextNodeMap));
    setIsEntry(node.isEntry);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setError(null);
    let content: Record<string, unknown>;
    let nextNodeMap: Record<string, string>;
    try {
      if (usesProductPicker(node.type)) {
        content = node.type === "product" ? { productIds } : { productId: productIds[0] };
      } else {
        content = JSON.parse(contentText || "{}");
      }
      nextNodeMap = JSON.parse(nextMapText || "{}");
    } catch {
      setError("content / nextNodeMap はJSON形式で入力してください");
      return;
    }

    if (usesProductPicker(node.type) && productIds.length === 0) {
      setError("品番を1つ以上選択してください");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/scenarios/${scenarioId}/nodes/${node.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, nextNodeMap, isEntry }),
    });
    setSaving(false);

    if (!res.ok) {
      setError("更新に失敗しました");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
          {NODE_TYPE_LABELS[node.type]}
          {node.isEntry && " ・開始ノード"}
        </span>
        <div className="flex gap-3 text-xs">
          {!editing && (
            <button type="button" onClick={startEditing} className="text-blue-600 hover:underline">
              編集
            </button>
          )}
          <button type="button" onClick={onDelete} className="text-red-600 hover:underline">
            削除
          </button>
        </div>
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
        <span>ノードID:</span>
        <code className="select-all rounded bg-neutral-100 px-1.5 py-0.5">{node.id}</code>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(node.id)}
          className="text-blue-600 hover:underline"
        >
          コピー
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          {usesProductPicker(node.type) ? (
            <label className="block text-xs">
              <span className="mb-1 block text-neutral-500">
                品番{node.type === "product" ? "(複数選択でカルーセル表示)" : "(1件選択)"}
              </span>
              <ProductPicker
                type={node.type}
                products={products}
                selectedIds={productIds}
                onChange={setProductIds}
              />
            </label>
          ) : null}
          {!usesProductPicker(node.type) && (
            <label className="block text-xs">
              <span className="mb-1 block text-neutral-500">content(JSON)</span>
              <textarea
                className="input font-mono"
                rows={3}
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
              />
            </label>
          )}
          <label className="block text-xs">
            <span className="mb-1 block text-neutral-500">nextNodeMap(JSON)</span>
            <textarea
              className="input font-mono"
              rows={2}
              value={nextMapText}
              onChange={(e) => setNextMapText(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isEntry} onChange={(e) => setIsEntry(e.target.checked)} />
            このノードを開始ノードにする
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {saving ? "保存中..." : "更新する"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <>
          {usesProductPicker(node.type) ? (
            <p className="rounded bg-neutral-50 p-2 text-xs">
              品番:{" "}
              {productIds
                .map((id) => products.find((p) => p.id === id))
                .filter((p): p is PickableProduct => Boolean(p))
                .map(productLabel)
                .join("、") || "未設定"}
            </p>
          ) : (
            <pre className="overflow-x-auto rounded bg-neutral-50 p-2 text-xs">
              content: {JSON.stringify(node.content)}
            </pre>
          )}
          <pre className="mt-1 overflow-x-auto rounded bg-neutral-50 p-2 text-xs">
            nextNodeMap: {JSON.stringify(node.nextNodeMap)}
          </pre>
        </>
      )}
    </div>
  );
}
