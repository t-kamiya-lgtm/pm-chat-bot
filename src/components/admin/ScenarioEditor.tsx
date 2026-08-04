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

interface OptionDraft {
  label: string;
  value: string;
  nextNodeId: string;
}

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

function truncate(text: string, max = 24) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 他ノードへの遷移先選択のドロップダウンに表示する、ノードの内容が分かる短い要約。 */
function nodeSummary(node: ScenarioNode, products: PickableProduct[]): string {
  const productNames = (ids: string[]) =>
    ids
      .map((id) => products.find((p) => p.id === id)?.name)
      .filter((name): name is string => Boolean(name))
      .join("、") || "未設定";

  switch (node.type) {
    case "message":
      return `メッセージ: ${truncate((node.content.text as string) ?? "")}`;
    case "choice":
      return `選択肢: ${truncate((node.content.text as string) ?? "")}`;
    case "product":
      return `商品提示: ${productNames(extractProductIds(node.content))}`;
    case "checkout":
      return `決済導線: ${productNames(extractProductIds(node.content))}`;
    case "product_qa":
      return `商品QA: ${productNames(extractProductIds(node.content))}`;
    default:
      return node.type;
  }
}

function NextNodeSelect({
  label,
  nodeOptions,
  value,
  onChange,
  compact,
}: {
  label: string;
  nodeOptions: { id: string; summary: string }[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <label className={`block ${compact ? "text-xs" : "text-sm"}`}>
      <span className={`mb-1 block font-medium ${compact ? "text-neutral-500" : "text-neutral-700"}`}>
        {label}
      </span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">(進まない/ここで終了)</option>
        {nodeOptions.map((n) => (
          <option key={n.id} value={n.id}>
            {n.summary}
          </option>
        ))}
      </select>
    </label>
  );
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
            <p className="text-xs text-neutral-400">このアイテムには品番が登録されていません</p>
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

function OptionsEditor({
  options,
  onChange,
  nodeOptions,
  compact,
}: {
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
  nodeOptions: { id: string; summary: string }[];
  compact?: boolean;
}) {
  function update(index: number, patch: Partial<OptionDraft>) {
    onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }
  function remove(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...options, { label: "", value: "", nextNodeId: "" }]);
  }

  const textSize = compact ? "text-xs" : "text-sm";

  return (
    <div className="space-y-2">
      <span className={`block font-medium ${compact ? "text-neutral-500" : "text-neutral-700"} ${textSize}`}>
        選択肢
      </span>
      {options.map((option, index) => (
        <div key={index} className="space-y-2 rounded-md border border-neutral-200 p-2">
          <input
            className="input"
            placeholder="表示ラベル(例: はい)"
            value={option.label}
            onChange={(e) => update(index, { label: e.target.value })}
          />
          <input
            className="input"
            placeholder="内部値(例: yes、他ノードから参照する識別子)"
            value={option.value}
            onChange={(e) => update(index, { value: e.target.value })}
          />
          <NextNodeSelect
            label="この選択肢を選んだ時に進むノード"
            nodeOptions={nodeOptions}
            value={option.nextNodeId}
            onChange={(v) => update(index, { nextNodeId: v })}
            compact={compact}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            className={`text-red-600 hover:underline ${textSize}`}
          >
            この選択肢を削除
          </button>
        </div>
      ))}
      {options.length === 0 && (
        <p className="text-xs text-neutral-400">選択肢がまだありません</p>
      )}
      <button type="button" onClick={add} className={`text-blue-600 hover:underline ${textSize}`}>
        + 選択肢を追加
      </button>
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
  const [newNodeProductIds, setNewNodeProductIds] = useState<string[]>([]);
  const [newNodeText, setNewNodeText] = useState("");
  const [newNodeImageUrl, setNewNodeImageUrl] = useState("");
  const [newNodeChoiceText, setNewNodeChoiceText] = useState("");
  const [newNodeOptions, setNewNodeOptions] = useState<OptionDraft[]>([]);
  const [newNodeDefaultNext, setNewNodeDefaultNext] = useState("");
  const [newNodeIsEntry, setNewNodeIsEntry] = useState(nodes.length === 0);
  const [error, setError] = useState<string | null>(null);

  const nodeOptions = nodes.map((n) => ({ id: n.id, summary: nodeSummary(n, products) }));

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

  async function handleRenameScenario() {
    const name = window.prompt("新しいシナリオ名を入力してください", scenario.name);
    if (!name || name === scenario.name) return;

    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(`名称の変更に失敗しました: ${JSON.stringify(body.error ?? res.status)}`);
      return;
    }
    router.refresh();
  }

  async function handleDeleteScenario() {
    if (
      !window.confirm(`「${scenario.name}」を削除しますか？中のノードもすべて削除され、取り消せません。`)
    )
      return;

    const res = await fetch(`/api/scenarios/${scenario.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(`削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`);
      return;
    }
    router.push("/admin/scenarios");
  }

  async function handleAddNode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    let content: Record<string, unknown>;
    let nextNodeMap: Record<string, string> = {};

    if (usesProductPicker(newNodeType)) {
      if (newNodeProductIds.length === 0) {
        setError("品番を1つ以上選択してください");
        return;
      }
      content =
        newNodeType === "product" ? { productIds: newNodeProductIds } : { productId: newNodeProductIds[0] };
      if (newNodeDefaultNext) nextNodeMap = { default: newNodeDefaultNext };
    } else if (newNodeType === "message") {
      if (!newNodeText.trim()) {
        setError("メッセージ本文を入力してください");
        return;
      }
      content = {
        text: newNodeText.trim(),
        ...(newNodeImageUrl.trim() && { imageUrl: newNodeImageUrl.trim() }),
      };
      if (newNodeDefaultNext) nextNodeMap = { default: newNodeDefaultNext };
    } else {
      if (!newNodeChoiceText.trim()) {
        setError("質問文を入力してください");
        return;
      }
      if (newNodeOptions.length === 0) {
        setError("選択肢を1つ以上追加してください");
        return;
      }
      if (newNodeOptions.some((o) => !o.label.trim() || !o.value.trim())) {
        setError("選択肢の表示ラベル・内部値を入力してください");
        return;
      }
      content = {
        text: newNodeChoiceText.trim(),
        options: newNodeOptions.map((o) => ({ label: o.label.trim(), value: o.value.trim() })),
      };
      nextNodeMap = {};
      for (const o of newNodeOptions) {
        if (o.nextNodeId) nextNodeMap[o.value.trim()] = o.nextNodeId;
      }
      if (newNodeDefaultNext) nextNodeMap.default = newNodeDefaultNext;
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

    setNewNodeProductIds([]);
    setNewNodeText("");
    setNewNodeImageUrl("");
    setNewNodeChoiceText("");
    setNewNodeOptions([]);
    setNewNodeDefaultNext("");
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{scenario.name}</h1>
          <button
            type="button"
            onClick={handleRenameScenario}
            className="text-sm text-blue-600 hover:underline"
          >
            名前を編集
          </button>
          <button
            type="button"
            onClick={handleDeleteScenario}
            className="text-sm text-red-600 hover:underline"
          >
            削除
          </button>
        </div>
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
            nodeOptions={nodeOptions.filter((n) => n.id !== node.id)}
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

        {usesProductPicker(newNodeType) && (
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
        )}

        {newNodeType === "message" && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">メッセージ本文</span>
              <textarea
                className="input"
                rows={3}
                value={newNodeText}
                onChange={(e) => setNewNodeText(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">画像URL(任意)</span>
              <input
                className="input"
                value={newNodeImageUrl}
                onChange={(e) => setNewNodeImageUrl(e.target.value)}
              />
            </label>
          </>
        )}

        {newNodeType === "choice" && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">質問文</span>
              <textarea
                className="input"
                rows={2}
                value={newNodeChoiceText}
                onChange={(e) => setNewNodeChoiceText(e.target.value)}
              />
            </label>
            <OptionsEditor
              options={newNodeOptions}
              onChange={setNewNodeOptions}
              nodeOptions={nodeOptions}
            />
          </>
        )}

        <NextNodeSelect
          label={newNodeType === "choice" ? "どの選択肢にも一致しない場合に進むノード(任意)" : "次に進むノード"}
          nodeOptions={nodeOptions}
          value={newNodeDefaultNext}
          onChange={setNewNodeDefaultNext}
        />

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
  nodeOptions,
  onDelete,
}: {
  scenarioId: string;
  node: ScenarioNode;
  products: PickableProduct[];
  nodeOptions: { id: string; summary: string }[];
  onDelete: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [productIds, setProductIds] = useState<string[]>(extractProductIds(node.content));
  const [text, setText] = useState((node.content.text as string) ?? "");
  const [imageUrl, setImageUrl] = useState((node.content.imageUrl as string) ?? "");
  const [options, setOptions] = useState<OptionDraft[]>(
    ((node.content.options as { label: string; value: string }[] | undefined) ?? []).map((o) => ({
      label: o.label,
      value: o.value,
      nextNodeId: node.nextNodeMap[o.value] ?? "",
    })),
  );
  const [defaultNext, setDefaultNext] = useState(node.nextNodeMap.default ?? "");
  const [isEntry, setIsEntry] = useState(node.isEntry);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setProductIds(extractProductIds(node.content));
    setText((node.content.text as string) ?? "");
    setImageUrl((node.content.imageUrl as string) ?? "");
    setOptions(
      ((node.content.options as { label: string; value: string }[] | undefined) ?? []).map((o) => ({
        label: o.label,
        value: o.value,
        nextNodeId: node.nextNodeMap[o.value] ?? "",
      })),
    );
    setDefaultNext(node.nextNodeMap.default ?? "");
    setIsEntry(node.isEntry);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setError(null);
    let content: Record<string, unknown>;
    let nextNodeMap: Record<string, string> = {};

    if (usesProductPicker(node.type)) {
      if (productIds.length === 0) {
        setError("品番を1つ以上選択してください");
        return;
      }
      content = node.type === "product" ? { productIds } : { productId: productIds[0] };
      if (defaultNext) nextNodeMap = { default: defaultNext };
    } else if (node.type === "message") {
      if (!text.trim()) {
        setError("メッセージ本文を入力してください");
        return;
      }
      content = { text: text.trim(), ...(imageUrl.trim() && { imageUrl: imageUrl.trim() }) };
      if (defaultNext) nextNodeMap = { default: defaultNext };
    } else {
      if (!text.trim()) {
        setError("質問文を入力してください");
        return;
      }
      if (options.length === 0) {
        setError("選択肢を1つ以上追加してください");
        return;
      }
      if (options.some((o) => !o.label.trim() || !o.value.trim())) {
        setError("選択肢の表示ラベル・内部値を入力してください");
        return;
      }
      content = {
        text: text.trim(),
        options: options.map((o) => ({ label: o.label.trim(), value: o.value.trim() })),
      };
      nextNodeMap = {};
      for (const o of options) {
        if (o.nextNodeId) nextNodeMap[o.value.trim()] = o.nextNodeId;
      }
      if (defaultNext) nextNodeMap.default = defaultNext;
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

          {usesProductPicker(node.type) && (
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
          )}

          {node.type === "message" && (
            <>
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">メッセージ本文</span>
                <textarea
                  className="input"
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">画像URL(任意)</span>
                <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              </label>
            </>
          )}

          {node.type === "choice" && (
            <>
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">質問文</span>
                <textarea
                  className="input"
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <OptionsEditor options={options} onChange={setOptions} nodeOptions={nodeOptions} compact />
            </>
          )}

          <NextNodeSelect
            label={node.type === "choice" ? "どの選択肢にも一致しない場合に進むノード(任意)" : "次に進むノード"}
            nodeOptions={nodeOptions}
            value={defaultNext}
            onChange={setDefaultNext}
            compact
          />

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
          ) : node.type === "message" ? (
            <div className="rounded bg-neutral-50 p-2 text-xs whitespace-pre-wrap">
              {text || "(未設定)"}
              {imageUrl && <p className="mt-1 text-neutral-400">画像: {imageUrl}</p>}
            </div>
          ) : (
            <div className="rounded bg-neutral-50 p-2 text-xs whitespace-pre-wrap">
              {text || "(未設定)"}
              {options.length > 0 && (
                <p className="mt-1 text-neutral-500">
                  選択肢: {options.map((o) => o.label || o.value).join("、")}
                </p>
              )}
            </div>
          )}
          <p className="mt-1 rounded bg-neutral-50 p-2 text-xs text-neutral-500">
            次のノード:{" "}
            {node.type === "choice"
              ? options
                  .map((o) => {
                    const target = nodeOptions.find((n) => n.id === o.nextNodeId);
                    return target ? `${o.label || o.value}→${target.summary}` : null;
                  })
                  .filter(Boolean)
                  .join("、") ||
                (nodeOptions.find((n) => n.id === defaultNext)?.summary ?? "未設定")
              : (nodeOptions.find((n) => n.id === defaultNext)?.summary ?? "未設定")}
          </p>
        </>
      )}
    </div>
  );
}
