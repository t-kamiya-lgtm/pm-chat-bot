"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Product,
  Scenario,
  ScenarioNode,
  ScenarioNodeType,
  SurveyAnswerType,
  SurveyQuestion,
} from "@/lib/types";

const SURVEY_ANSWER_TYPE_LABELS: Record<SurveyAnswerType, string> = {
  checkbox: "チェックボックス(複数選択)",
  radio: "ラジオボタン(単一選択)",
  date: "生年月日",
  text_short: "フリーコメント(短文)",
  text_long: "フリーコメント(長文)",
};

const NODE_TYPE_LABELS: Record<ScenarioNodeType, string> = {
  message: "メッセージ表示",
  choice: "選択肢分岐",
  product: "商品提示",
  checkout: "決済導線",
  product_qa: "商品QA",
  image: "画像表示",
  survey: "アンケート",
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
  /** 設定すると、次のノードへ進む代わりにこの商品のQ&Aをその場で表示する(nextNodeIdより優先)。 */
  qaProductId?: string;
}

/** 選択肢のnextNodeMapで、実ノードの代わりに商品Q&Aをその場表示するためのsentinel値。 */
const QA_TARGET_PREFIX = "qa:";

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

function buildChoiceNextNodeMap(options: OptionDraft[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const o of options) {
    if (o.qaProductId) map[o.value.trim()] = `${QA_TARGET_PREFIX}${o.qaProductId}`;
    else if (o.nextNodeId) map[o.value.trim()] = o.nextNodeId;
  }
  return map;
}

/** next_node_mapの値からQ&A sentinelを検出し、選択肢の遷移先情報に変換する。 */
function parseChoiceOptionTarget(
  nextNodeMap: Record<string, string>,
  value: string,
): Pick<OptionDraft, "nextNodeId" | "qaProductId"> {
  const target = nextNodeMap[value] ?? "";
  if (target.startsWith(QA_TARGET_PREFIX)) {
    return { nextNodeId: "", qaProductId: target.slice(QA_TARGET_PREFIX.length) };
  }
  return { nextNodeId: target };
}

function serializeSurveyQuestions(questions: SurveyQuestion[]): SurveyQuestion[] {
  return questions.map((q) => {
    const type = q.type ?? "text_short";
    const isChoice = type === "checkbox" || type === "radio";
    return {
      label: q.label.trim(),
      required: q.required,
      type,
      ...(isChoice && { options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }),
      ...(isChoice && { allowOther: q.allowOther ?? false }),
    };
  });
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
    case "product_qa": {
      const groupNames =
        extractProductIds(node.content)
          .map((id) => products.find((p) => p.id === id)?.productGroupName)
          .filter((name): name is string => Boolean(name))
          .join("、") || "未設定";
      return `商品QA: ${groupNames}`;
    }
    case "image": {
      const urls =
        (node.content.imageUrls as string[] | undefined) ??
        (node.content.imageUrl ? [node.content.imageUrl as string] : []);
      return `画像表示: ${truncate((node.content.caption as string) || urls[0] || "")}${urls.length > 1 ? `他${urls.length}枚` : ""}`;
    }
    case "survey":
      return `アンケート: ${((node.content.questions as SurveyQuestion[] | undefined) ?? []).length}件の質問`;
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
        <option value="">(未設定・自動的に一覧の次のノードへ進みます。最後のノードの場合はここで終了)</option>
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

/** 商品QAはアイテム(商品種類=親品番)単位で登録されるため、品番ではなくアイテム単位で選択する。 */
function productGroupOptions(products: PickableProduct[]) {
  const map = new Map<string, { id: string; name: string; representativeProductId: string }>();
  for (const p of products) {
    if (!p.productGroupId) continue;
    if (!map.has(p.productGroupId)) {
      map.set(p.productGroupId, {
        id: p.productGroupId,
        name: p.productGroupName ?? "未分類",
        representativeProductId: p.id,
      });
    }
  }
  return Array.from(map.values());
}

function ProductGroupSelect({
  products,
  value,
  onChange,
  label,
  allowEmpty,
  compact,
}: {
  products: PickableProduct[];
  /** 選択中のアイテムを表す代表品番ID。 */
  value: string;
  /** 選択されたアイテムの代表品番IDを返す(空文字は未選択)。 */
  onChange: (productId: string) => void;
  label: string;
  allowEmpty?: boolean;
  compact?: boolean;
}) {
  const groups = productGroupOptions(products);
  const selectedGroupId = products.find((p) => p.id === value)?.productGroupId ?? "";

  if (groups.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        アイテム(商品種類)が登録されていません。先に品番を登録してください。
      </p>
    );
  }

  return (
    <label className={`block ${compact ? "text-xs" : "text-sm"}`}>
      <span className={`mb-1 block font-medium ${compact ? "text-neutral-500" : "text-neutral-700"}`}>
        {label}
      </span>
      <select
        className="input"
        value={selectedGroupId}
        onChange={(e) => {
          const group = groups.find((g) => g.id === e.target.value);
          onChange(group?.representativeProductId ?? "");
        }}
      >
        {(allowEmpty || !selectedGroupId) && (
          <option value="">{allowEmpty ? "設定しない" : "アイテムを選択してください"}</option>
        )}
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ImageUrlListEditor({
  urls,
  onChange,
  compact,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  compact?: boolean;
}) {
  const textSize = compact ? "text-xs" : "text-sm";

  return (
    <div className="space-y-2">
      <span className={`block font-medium ${compact ? "text-neutral-500" : "text-neutral-700"} ${textSize}`}>
        画像URL(複数登録すると、チャット上でカルーセル表示になります)
      </span>
      {urls.map((url, index) => (
        <div key={index} className="flex gap-2">
          <input
            className="input"
            value={url}
            onChange={(e) => onChange(urls.map((u, i) => (i === index ? e.target.value : u)))}
          />
          <button
            type="button"
            onClick={() => onChange(urls.filter((_, i) => i !== index))}
            className={`shrink-0 rounded-md border border-neutral-300 px-3 hover:bg-neutral-50 ${textSize}`}
          >
            削除
          </button>
        </div>
      ))}
      {urls.length === 0 && <p className="text-xs text-neutral-400">画像がまだ登録されていません</p>}
      <button type="button" onClick={() => onChange([...urls, ""])} className={`text-blue-600 hover:underline ${textSize}`}>
        + 画像URLを追加
      </button>
    </div>
  );
}

function OptionalProductSelect({
  products,
  value,
  onChange,
  label,
  compact,
}: {
  products: PickableProduct[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <label className={`block ${compact ? "text-xs" : "text-sm"}`}>
      <span className={`mb-1 block font-medium ${compact ? "text-neutral-500" : "text-neutral-700"}`}>
        {label}
      </span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">設定しない</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.productGroupName ? `${product.productGroupName} / ` : ""}
            {productLabel(product)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProductNextNodeEditor({
  productIds,
  products,
  nextNodeByProduct,
  onChange,
  nodeOptions,
  compact,
}: {
  productIds: string[];
  products: PickableProduct[];
  nextNodeByProduct: Record<string, string>;
  onChange: (map: Record<string, string>) => void;
  nodeOptions: { id: string; summary: string }[];
  compact?: boolean;
}) {
  if (productIds.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-neutral-200 p-3">
      <span
        className={`block font-medium ${compact ? "text-neutral-500" : "text-neutral-700"} ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        商品ごとの次のノード(任意・選んだ商品によって行き先を分けられます。未設定の商品は下の「次に進むノード」に進みます)
      </span>
      {productIds.map((id) => {
        const product = products.find((p) => p.id === id);
        return (
          <NextNodeSelect
            key={id}
            label={product ? productLabel(product) : id}
            nodeOptions={nodeOptions}
            value={nextNodeByProduct[id] ?? ""}
            onChange={(v) => onChange({ ...nextNodeByProduct, [id]: v })}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
  nodeOptions,
  products,
  compact,
}: {
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
  nodeOptions: { id: string; summary: string }[];
  products: PickableProduct[];
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
    <div className="space-y-3">
      <span className={`block font-medium ${compact ? "text-neutral-500" : "text-neutral-700"} ${textSize}`}>
        選択肢(それぞれがチャット上に1つのボタンとして表示されます)
      </span>
      {options.map((option, index) => (
        <div key={index} className="space-y-2 rounded-md border-2 border-neutral-300 bg-neutral-50 p-3">
          <div className={`flex items-center justify-between font-semibold text-neutral-600 ${textSize}`}>
            <span>選択肢 {index + 1}</span>
            <button type="button" onClick={() => remove(index)} className="font-normal text-red-600 hover:underline">
              この選択肢を削除
            </button>
          </div>
          <label className={`block ${textSize}`}>
            <span className="mb-1 block text-neutral-500">表示ラベル(ボタンに表示される文言。例: Q&Aを見る)</span>
            <input
              className="input bg-white"
              placeholder="例: Q&Aを見る"
              value={option.label}
              onChange={(e) => update(index, { label: e.target.value, value: e.target.value })}
            />
          </label>
          <ProductGroupSelect
            label="Q&Aをその場で表示するアイテム(商品Q&Aはアイテム単位のため品番ではなくアイテムを選択・設定すると下の「次に進むノード」より優先されます)"
            products={products}
            value={option.qaProductId ?? ""}
            onChange={(id) => update(index, { qaProductId: id || undefined })}
            allowEmpty
            compact={compact}
          />
          {option.qaProductId ? (
            <p className={`text-neutral-400 ${textSize}`}>
              Q&A表示が設定されているため、次のノードへは進みません
            </p>
          ) : (
            <NextNodeSelect
              label="この選択肢を選んだ時に進むノード"
              nodeOptions={nodeOptions}
              value={option.nextNodeId}
              onChange={(v) => update(index, { nextNodeId: v })}
              compact={compact}
            />
          )}
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

function SurveyOptionListEditor({
  options,
  onChange,
  textSize,
}: {
  options: string[];
  onChange: (options: string[]) => void;
  textSize: string;
}) {
  return (
    <div className="space-y-1">
      {options.map((option, index) => (
        <div key={index} className="flex gap-2">
          <input
            className="input"
            placeholder={`選択肢${index + 1}`}
            value={option}
            onChange={(e) => onChange(options.map((o, i) => (i === index ? e.target.value : o)))}
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, i) => i !== index))}
            className={`shrink-0 rounded-md border border-neutral-300 px-3 hover:bg-neutral-50 ${textSize}`}
          >
            削除
          </button>
        </div>
      ))}
      {options.length === 0 && <p className="text-xs text-neutral-400">選択肢がまだありません</p>}
      <button
        type="button"
        onClick={() => onChange([...options, ""])}
        className={`text-blue-600 hover:underline ${textSize}`}
      >
        + 選択肢を追加
      </button>
    </div>
  );
}

function SurveyQuestionsEditor({
  questions,
  onChange,
  compact,
}: {
  questions: SurveyQuestion[];
  onChange: (questions: SurveyQuestion[]) => void;
  compact?: boolean;
}) {
  function update(index: number, patch: Partial<SurveyQuestion>) {
    onChange(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }
  function remove(index: number) {
    onChange(questions.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...questions, { label: "", required: false, type: "text_short" }]);
  }

  const textSize = compact ? "text-xs" : "text-sm";

  return (
    <div className="space-y-2">
      <span className={`block font-medium ${compact ? "text-neutral-500" : "text-neutral-700"} ${textSize}`}>
        質問項目(お客様は全体をスキップできます。項目ごとに回答必須にできます)
      </span>
      {questions.map((question, index) => {
        const type = question.type ?? "text_short";
        const isChoice = type === "checkbox" || type === "radio";
        return (
          <div key={index} className="space-y-2 rounded-md border border-neutral-200 p-2">
            <input
              className="input"
              placeholder="質問文(例: 現在お悩みのことはありますか？)"
              value={question.label}
              onChange={(e) => update(index, { label: e.target.value })}
            />
            <label className={`block ${textSize}`}>
              <span className="mb-1 block text-neutral-500">回答形式</span>
              <select
                className="input"
                value={type}
                onChange={(e) => update(index, { type: e.target.value as SurveyAnswerType })}
              >
                {(Object.keys(SURVEY_ANSWER_TYPE_LABELS) as SurveyAnswerType[]).map((t) => (
                  <option key={t} value={t}>
                    {SURVEY_ANSWER_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            {isChoice && (
              <div className="space-y-2 rounded-md border border-neutral-200 p-2">
                <SurveyOptionListEditor
                  options={question.options ?? []}
                  onChange={(options) => update(index, { options })}
                  textSize={textSize}
                />
                <label className="flex items-center gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={question.allowOther ?? false}
                    onChange={(e) => update(index, { allowOther: e.target.checked })}
                  />
                  「その他(自由入力)」の選択肢を追加する
                </label>
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => update(index, { required: e.target.checked })}
              />
              回答必須にする
            </label>
            <button
              type="button"
              onClick={() => remove(index)}
              className={`text-red-600 hover:underline ${textSize}`}
            >
              この質問を削除
            </button>
          </div>
        );
      })}
      {questions.length === 0 && <p className="text-xs text-neutral-400">質問がまだありません</p>}
      <button type="button" onClick={add} className={`text-blue-600 hover:underline ${textSize}`}>
        + 質問を追加
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
  const [newNodeUpsellProductId, setNewNodeUpsellProductId] = useState("");
  const [newNodeUpsellImageUrl, setNewNodeUpsellImageUrl] = useState("");
  const [newNodeUpsellComment, setNewNodeUpsellComment] = useState("");
  const [newNodeCrossSellProductId, setNewNodeCrossSellProductId] = useState("");
  const [newNodeCrossSellImageUrl, setNewNodeCrossSellImageUrl] = useState("");
  const [newNodeCrossSellComment, setNewNodeCrossSellComment] = useState("");
  const [newNodeProductNextMap, setNewNodeProductNextMap] = useState<Record<string, string>>({});
  const [newNodeText, setNewNodeText] = useState("");
  const [newNodeImageUrl, setNewNodeImageUrl] = useState("");
  const [newNodeImageUrls, setNewNodeImageUrls] = useState<string[]>([""]);
  const [newNodeImageLinkUrl, setNewNodeImageLinkUrl] = useState("");
  const [newNodeImageCaption, setNewNodeImageCaption] = useState("");
  const [newNodeSurveyQuestions, setNewNodeSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [newNodeChoiceText, setNewNodeChoiceText] = useState("");
  const [newNodeOptions, setNewNodeOptions] = useState<OptionDraft[]>([]);
  const [newNodeDefaultNext, setNewNodeDefaultNext] = useState("");
  const [newNodeIsEntry, setNewNodeIsEntry] = useState(nodes.length === 0);
  const [newNodeMemo, setNewNodeMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reorderPending, setReorderPending] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

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
      if (newNodeType === "checkout") {
        content = {
          ...content,
          ...(newNodeUpsellProductId && { upsellProductId: newNodeUpsellProductId }),
          ...(newNodeUpsellImageUrl.trim() && { upsellImageUrl: newNodeUpsellImageUrl.trim() }),
          ...(newNodeUpsellComment.trim() && { upsellComment: newNodeUpsellComment.trim() }),
          ...(newNodeCrossSellProductId && { crossSellProductId: newNodeCrossSellProductId }),
          ...(newNodeCrossSellImageUrl.trim() && { crossSellImageUrl: newNodeCrossSellImageUrl.trim() }),
          ...(newNodeCrossSellComment.trim() && { crossSellComment: newNodeCrossSellComment.trim() }),
        };
      }
      if (newNodeType === "product") {
        nextNodeMap = {};
        for (const id of newNodeProductIds) {
          const next = newNodeProductNextMap[id];
          if (next) nextNodeMap[id] = next;
        }
        if (newNodeDefaultNext) nextNodeMap.default = newNodeDefaultNext;
      } else if (newNodeDefaultNext) {
        nextNodeMap = { default: newNodeDefaultNext };
      }
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
    } else if (newNodeType === "choice") {
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
      nextNodeMap = buildChoiceNextNodeMap(newNodeOptions);
      if (newNodeDefaultNext) nextNodeMap.default = newNodeDefaultNext;
    } else if (newNodeType === "image") {
      const urls = newNodeImageUrls.map((u) => u.trim()).filter(Boolean);
      if (urls.length === 0) {
        setError("画像URLを入力してください");
        return;
      }
      content = {
        imageUrls: urls,
        ...(newNodeImageLinkUrl.trim() && { linkUrl: newNodeImageLinkUrl.trim() }),
        ...(newNodeImageCaption.trim() && { caption: newNodeImageCaption.trim() }),
      };
      if (newNodeDefaultNext) nextNodeMap = { default: newNodeDefaultNext };
    } else {
      if (newNodeSurveyQuestions.length === 0) {
        setError("質問を1つ以上追加してください");
        return;
      }
      if (newNodeSurveyQuestions.some((q) => !q.label.trim())) {
        setError("質問文を入力してください");
        return;
      }
      if (
        newNodeSurveyQuestions.some(
          (q) =>
            (q.type === "checkbox" || q.type === "radio") &&
            (q.options ?? []).map((o) => o.trim()).filter(Boolean).length === 0,
        )
      ) {
        setError("チェックボックス・ラジオボタンの質問には選択肢を1つ以上入力してください");
        return;
      }
      content = {
        questions: serializeSurveyQuestions(newNodeSurveyQuestions),
      };
      if (newNodeDefaultNext) nextNodeMap = { default: newNodeDefaultNext };
    }

    const res = await fetch(`/api/scenarios/${scenario.id}/nodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: newNodeType,
        content,
        nextNodeMap,
        isEntry: newNodeIsEntry,
        ...(newNodeMemo.trim() && { memo: newNodeMemo.trim() }),
      }),
    });

    if (!res.ok) {
      setError("ノードの追加に失敗しました");
      return;
    }

    setNewNodeProductIds([]);
    setNewNodeUpsellProductId("");
    setNewNodeUpsellImageUrl("");
    setNewNodeUpsellComment("");
    setNewNodeCrossSellProductId("");
    setNewNodeCrossSellImageUrl("");
    setNewNodeCrossSellComment("");
    setNewNodeProductNextMap({});
    setNewNodeText("");
    setNewNodeImageUrl("");
    setNewNodeImageUrls([""]);
    setNewNodeImageLinkUrl("");
    setNewNodeImageCaption("");
    setNewNodeSurveyQuestions([]);
    setNewNodeChoiceText("");
    setNewNodeOptions([]);
    setNewNodeDefaultNext("");
    setNewNodeIsEntry(false);
    setNewNodeMemo("");
    router.refresh();
  }

  async function handleDeleteNode(nodeId: string) {
    if (!window.confirm("このノードを削除しますか？")) return;
    await fetch(`/api/scenarios/${scenario.id}/nodes/${nodeId}`, { method: "DELETE" });
    router.refresh();
  }

  /** fromIndexのノードをtoPosition(1始まりの表示順)へ移動する。間の全ノードのdisplay_orderを詰め直す。 */
  async function moveNodeToPosition(fromIndex: number, toPosition: number) {
    const toIndex = Math.max(0, Math.min(nodes.length - 1, toPosition - 1));
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= nodes.length) return;

    const moved = nodes[fromIndex];
    const reordered = [...nodes];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setReorderPending(moved.id);

    const patches = new Map<string, { displayOrder?: number; nextNodeMap?: Record<string, string> }>();
    reordered.forEach((node, i) => {
      if (node.displayOrder !== i) patches.set(node.id, { displayOrder: i });
    });

    // 2つのノードの間に挿入した場合、直前のノードが直後のノードへ直接繋がっている(=挿入したノードを飛ばしてしまう)なら、
    // 挿入したノードを経由するように繋ぎ直す
    const newIndex = reordered.indexOf(moved);
    const newPrev = reordered[newIndex - 1];
    const newNext = reordered[newIndex + 1];
    if (newPrev && newNext && newPrev.nextNodeMap.default === newNext.id) {
      patches.set(newPrev.id, {
        ...patches.get(newPrev.id),
        nextNodeMap: { ...newPrev.nextNodeMap, default: moved.id },
      });
      if (!moved.nextNodeMap.default) {
        patches.set(moved.id, {
          ...patches.get(moved.id),
          nextNodeMap: { ...moved.nextNodeMap, default: newNext.id },
        });
      }
    }

    await Promise.all(
      Array.from(patches.entries()).map(([nodeId, patch]) =>
        fetch(`/api/scenarios/${scenario.id}/nodes/${nodeId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        }),
      ),
    );
    setReorderPending(null);
    router.refresh();
  }

  function handleDrop(targetIndex: number) {
    if (draggingIndex === null) return;
    const fromIndex = draggingIndex;
    setDraggingIndex(null);
    if (fromIndex === targetIndex) return;
    moveNodeToPosition(fromIndex, targetIndex + 1);
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
        <div className="flex items-center gap-2">
          <a
            href={`/widget?scenarioId=${scenario.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            プレビュー
          </a>
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
      </div>

      {products.length === 0 && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          商品が登録されていません。「商品提示」「決済導線」「商品QA」ノードで参照する場合は先に商品を登録してください。
        </p>
      )}

      <div className="mb-8 space-y-3">
        {nodes.map((node, index) => (
          <div
            key={node.id}
            className={`flex items-start gap-2 ${draggingIndex === index ? "opacity-40" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
          >
            <div className="flex shrink-0 flex-col items-center gap-1 pt-4">
              <div
                draggable
                onDragStart={() => setDraggingIndex(index)}
                onDragEnd={() => setDraggingIndex(null)}
                title="ドラッグして並び替え"
                className="cursor-grab select-none rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-50 active:cursor-grabbing"
              >
                ⠿
              </div>
              <input
                type="number"
                key={`${node.id}-${index}`}
                defaultValue={index + 1}
                min={1}
                max={nodes.length}
                disabled={reorderPending !== null}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value) && value !== index + 1) moveNodeToPosition(index, value);
                }}
                className="input w-14 px-1 text-center text-xs"
              />
              <button
                type="button"
                disabled={reorderPending !== null || index === 0}
                onClick={() => moveNodeToPosition(index, index)}
                className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                disabled={reorderPending !== null || index === nodes.length - 1}
                onClick={() => moveNodeToPosition(index, index + 2)}
                className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <div className="flex-1">
              <NodeCard
                scenarioId={scenario.id}
                node={node}
                products={products}
                nodeOptions={nodeOptions.filter((n) => n.id !== node.id)}
                onDelete={() => handleDeleteNode(node.id)}
              />
            </div>
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

        {usesProductPicker(newNodeType) &&
          (newNodeType === "product_qa" ? (
            <ProductGroupSelect
              label="アイテム(商品Q&Aはアイテム単位で登録されているため、品番ではなくアイテムを選択します)"
              products={products}
              value={newNodeProductIds[0] ?? ""}
              onChange={(id) => setNewNodeProductIds(id ? [id] : [])}
            />
          ) : (
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
          ))}

        {newNodeType === "product" && (
          <ProductNextNodeEditor
            productIds={newNodeProductIds}
            products={products}
            nextNodeByProduct={newNodeProductNextMap}
            onChange={setNewNodeProductNextMap}
            nodeOptions={nodeOptions}
          />
        )}

        {newNodeType === "checkout" && (
          <div className="space-y-3 rounded-md border border-neutral-200 p-3">
            <p className="text-xs text-neutral-500">
              注文確認画面でのアップセル(商品を入れ替える提案)・クロスセル(追加でもう1点提案)を設定できます(どちらも任意)。
            </p>
            <OptionalProductSelect
              label="アップセル商品(任意・「商品を変更する」ボタンで入れ替え提案)"
              products={products}
              value={newNodeUpsellProductId}
              onChange={setNewNodeUpsellProductId}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">アップセル画像URL(任意・正方形推奨)</span>
              <input
                className="input"
                value={newNodeUpsellImageUrl}
                onChange={(e) => setNewNodeUpsellImageUrl(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                アップセルの案内文(任意・未入力時は「〇〇はいかがですか？」を自動表示)
              </span>
              <textarea
                className="input"
                rows={2}
                value={newNodeUpsellComment}
                onChange={(e) => setNewNodeUpsellComment(e.target.value)}
              />
            </label>
            <OptionalProductSelect
              label="クロスセル商品(任意・「カートに追加する」ボタンで追加提案)"
              products={products}
              value={newNodeCrossSellProductId}
              onChange={setNewNodeCrossSellProductId}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">クロスセル画像URL(任意・正方形推奨)</span>
              <input
                className="input"
                value={newNodeCrossSellImageUrl}
                onChange={(e) => setNewNodeCrossSellImageUrl(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                クロスセルの案内文(任意・未入力時は「〇〇も一緒にいかがですか？」を自動表示)
              </span>
              <textarea
                className="input"
                rows={2}
                value={newNodeCrossSellComment}
                onChange={(e) => setNewNodeCrossSellComment(e.target.value)}
              />
            </label>
          </div>
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
              products={products}
            />
          </>
        )}

        {newNodeType === "image" && (
          <>
            <ImageUrlListEditor urls={newNodeImageUrls} onChange={setNewNodeImageUrls} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">リンクURL(任意・画像タップ時に開く)</span>
              <input
                className="input"
                value={newNodeImageLinkUrl}
                onChange={(e) => setNewNodeImageLinkUrl(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">キャプション(任意)</span>
              <input
                className="input"
                value={newNodeImageCaption}
                onChange={(e) => setNewNodeImageCaption(e.target.value)}
              />
            </label>
          </>
        )}

        {newNodeType === "survey" && (
          <SurveyQuestionsEditor questions={newNodeSurveyQuestions} onChange={setNewNodeSurveyQuestions} />
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

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">
            メモ(任意・管理用。チャットボット画面には表示されません)
          </span>
          <textarea
            className="input"
            rows={2}
            value={newNodeMemo}
            onChange={(e) => setNewNodeMemo(e.target.value)}
          />
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
  const [upsellProductId, setUpsellProductId] = useState((node.content.upsellProductId as string) ?? "");
  const [upsellImageUrl, setUpsellImageUrl] = useState((node.content.upsellImageUrl as string) ?? "");
  const [upsellComment, setUpsellComment] = useState((node.content.upsellComment as string) ?? "");
  const [crossSellProductId, setCrossSellProductId] = useState(
    (node.content.crossSellProductId as string) ?? "",
  );
  const [crossSellImageUrl, setCrossSellImageUrl] = useState(
    (node.content.crossSellImageUrl as string) ?? "",
  );
  const [crossSellComment, setCrossSellComment] = useState(
    (node.content.crossSellComment as string) ?? "",
  );
  const [productNextMap, setProductNextMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      extractProductIds(node.content)
        .filter((id) => node.nextNodeMap[id])
        .map((id) => [id, node.nextNodeMap[id]]),
    ),
  );
  const [text, setText] = useState((node.content.text as string) ?? "");
  const [imageUrl, setImageUrl] = useState((node.content.imageUrl as string) ?? "");
  const [imageUrls, setImageUrls] = useState<string[]>(
    (node.content.imageUrls as string[] | undefined) ??
      (node.content.imageUrl ? [node.content.imageUrl as string] : [""]),
  );
  const [imageLinkUrl, setImageLinkUrl] = useState((node.content.linkUrl as string) ?? "");
  const [imageCaption, setImageCaption] = useState((node.content.caption as string) ?? "");
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>(
    (node.content.questions as SurveyQuestion[] | undefined) ?? [],
  );
  const [memo, setMemo] = useState(node.memo ?? "");
  const [options, setOptions] = useState<OptionDraft[]>(
    ((node.content.options as { label: string; value: string }[] | undefined) ?? []).map((o) => ({
      label: o.label,
      value: o.value,
      ...parseChoiceOptionTarget(node.nextNodeMap, o.value),
    })),
  );
  const [defaultNext, setDefaultNext] = useState(node.nextNodeMap.default ?? "");
  const [isEntry, setIsEntry] = useState(node.isEntry);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    const ids = extractProductIds(node.content);
    setProductIds(ids);
    setUpsellProductId((node.content.upsellProductId as string) ?? "");
    setUpsellImageUrl((node.content.upsellImageUrl as string) ?? "");
    setUpsellComment((node.content.upsellComment as string) ?? "");
    setCrossSellProductId((node.content.crossSellProductId as string) ?? "");
    setCrossSellImageUrl((node.content.crossSellImageUrl as string) ?? "");
    setCrossSellComment((node.content.crossSellComment as string) ?? "");
    setProductNextMap(
      Object.fromEntries(ids.filter((id) => node.nextNodeMap[id]).map((id) => [id, node.nextNodeMap[id]])),
    );
    setText((node.content.text as string) ?? "");
    setImageUrl((node.content.imageUrl as string) ?? "");
    setImageUrls(
      (node.content.imageUrls as string[] | undefined) ??
        (node.content.imageUrl ? [node.content.imageUrl as string] : [""]),
    );
    setImageLinkUrl((node.content.linkUrl as string) ?? "");
    setImageCaption((node.content.caption as string) ?? "");
    setSurveyQuestions((node.content.questions as SurveyQuestion[] | undefined) ?? []);
    setMemo(node.memo ?? "");
    setOptions(
      ((node.content.options as { label: string; value: string }[] | undefined) ?? []).map((o) => ({
        label: o.label,
        value: o.value,
        ...parseChoiceOptionTarget(node.nextNodeMap, o.value),
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
      if (node.type === "checkout") {
        content = {
          ...content,
          ...(upsellProductId && { upsellProductId }),
          ...(upsellImageUrl.trim() && { upsellImageUrl: upsellImageUrl.trim() }),
          ...(upsellComment.trim() && { upsellComment: upsellComment.trim() }),
          ...(crossSellProductId && { crossSellProductId }),
          ...(crossSellImageUrl.trim() && { crossSellImageUrl: crossSellImageUrl.trim() }),
          ...(crossSellComment.trim() && { crossSellComment: crossSellComment.trim() }),
        };
      }
      if (node.type === "product") {
        nextNodeMap = {};
        for (const id of productIds) {
          const next = productNextMap[id];
          if (next) nextNodeMap[id] = next;
        }
        if (defaultNext) nextNodeMap.default = defaultNext;
      } else if (defaultNext) {
        nextNodeMap = { default: defaultNext };
      }
    } else if (node.type === "message") {
      if (!text.trim()) {
        setError("メッセージ本文を入力してください");
        return;
      }
      content = { text: text.trim(), ...(imageUrl.trim() && { imageUrl: imageUrl.trim() }) };
      if (defaultNext) nextNodeMap = { default: defaultNext };
    } else if (node.type === "choice") {
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
      nextNodeMap = buildChoiceNextNodeMap(options);
      if (defaultNext) nextNodeMap.default = defaultNext;
    } else if (node.type === "image") {
      const urls = imageUrls.map((u) => u.trim()).filter(Boolean);
      if (urls.length === 0) {
        setError("画像URLを入力してください");
        return;
      }
      content = {
        imageUrls: urls,
        ...(imageLinkUrl.trim() && { linkUrl: imageLinkUrl.trim() }),
        ...(imageCaption.trim() && { caption: imageCaption.trim() }),
      };
      if (defaultNext) nextNodeMap = { default: defaultNext };
    } else {
      if (surveyQuestions.length === 0) {
        setError("質問を1つ以上追加してください");
        return;
      }
      if (surveyQuestions.some((q) => !q.label.trim())) {
        setError("質問文を入力してください");
        return;
      }
      if (
        surveyQuestions.some(
          (q) =>
            (q.type === "checkbox" || q.type === "radio") &&
            (q.options ?? []).map((o) => o.trim()).filter(Boolean).length === 0,
        )
      ) {
        setError("チェックボックス・ラジオボタンの質問には選択肢を1つ以上入力してください");
        return;
      }
      content = {
        questions: serializeSurveyQuestions(surveyQuestions),
      };
      if (defaultNext) nextNodeMap = { default: defaultNext };
    }

    setSaving(true);
    const res = await fetch(`/api/scenarios/${scenarioId}/nodes/${node.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, nextNodeMap, isEntry, memo: memo.trim() }),
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

          <label className="block text-xs">
            <span className="mb-1 block text-neutral-500">
              メモ(任意・管理用。チャットボット画面には表示されません)
            </span>
            <textarea className="input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>

          {usesProductPicker(node.type) &&
            (node.type === "product_qa" ? (
              <ProductGroupSelect
                label="アイテム(商品Q&Aはアイテム単位で登録されているため、品番ではなくアイテムを選択します)"
                products={products}
                value={productIds[0] ?? ""}
                onChange={(id) => setProductIds(id ? [id] : [])}
                compact
              />
            ) : (
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
            ))}

          {node.type === "product" && (
            <ProductNextNodeEditor
              productIds={productIds}
              products={products}
              nextNodeByProduct={productNextMap}
              onChange={setProductNextMap}
              nodeOptions={nodeOptions}
              compact
            />
          )}

          {node.type === "checkout" && (
            <div className="space-y-3 rounded-md border border-neutral-200 p-3">
              <p className="text-xs text-neutral-500">
                注文確認画面でのアップセル・クロスセル(どちらも任意)
              </p>
              <OptionalProductSelect
                label="アップセル商品(任意)"
                products={products}
                value={upsellProductId}
                onChange={setUpsellProductId}
                compact
              />
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">アップセル画像URL(任意・正方形推奨)</span>
                <input className="input" value={upsellImageUrl} onChange={(e) => setUpsellImageUrl(e.target.value)} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">
                  アップセルの案内文(任意・未入力時は「〇〇はいかがですか？」を自動表示)
                </span>
                <textarea
                  className="input"
                  rows={2}
                  value={upsellComment}
                  onChange={(e) => setUpsellComment(e.target.value)}
                />
              </label>
              <OptionalProductSelect
                label="クロスセル商品(任意)"
                products={products}
                value={crossSellProductId}
                onChange={setCrossSellProductId}
                compact
              />
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">クロスセル画像URL(任意・正方形推奨)</span>
                <input
                  className="input"
                  value={crossSellImageUrl}
                  onChange={(e) => setCrossSellImageUrl(e.target.value)}
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">
                  クロスセルの案内文(任意・未入力時は「〇〇も一緒にいかがですか？」を自動表示)
                </span>
                <textarea
                  className="input"
                  rows={2}
                  value={crossSellComment}
                  onChange={(e) => setCrossSellComment(e.target.value)}
                />
              </label>
            </div>
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
              <OptionsEditor
                options={options}
                onChange={setOptions}
                nodeOptions={nodeOptions}
                products={products}
                compact
              />
            </>
          )}

          {node.type === "image" && (
            <>
              <ImageUrlListEditor urls={imageUrls} onChange={setImageUrls} compact />
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">リンクURL(任意・画像タップ時に開く)</span>
                <input
                  className="input"
                  value={imageLinkUrl}
                  onChange={(e) => setImageLinkUrl(e.target.value)}
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">キャプション(任意)</span>
                <input
                  className="input"
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                />
              </label>
            </>
          )}

          {node.type === "survey" && (
            <SurveyQuestionsEditor questions={surveyQuestions} onChange={setSurveyQuestions} compact />
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
          {memo && (
            <p className="mb-2 rounded bg-amber-50 p-2 text-xs whitespace-pre-wrap text-amber-800">
              メモ: {memo}
            </p>
          )}
          {usesProductPicker(node.type) ? (
            <p className="rounded bg-neutral-50 p-2 text-xs">
              {node.type === "product_qa" ? "アイテム" : "品番"}:{" "}
              {node.type === "product_qa"
                ? productIds
                    .map((id) => products.find((p) => p.id === id)?.productGroupName)
                    .filter(Boolean)
                    .join("、") || "未設定"
                : productIds
                    .map((id) => products.find((p) => p.id === id))
                    .filter((p): p is PickableProduct => Boolean(p))
                    .map(productLabel)
                    .join("、") || "未設定"}
              {node.type === "checkout" && (upsellProductId || crossSellProductId) && (
                <span className="mt-1 block text-neutral-500">
                  {upsellProductId &&
                    `アップセル: ${products.find((p) => p.id === upsellProductId)?.name ?? "未設定"}`}
                  {upsellProductId && crossSellProductId && " / "}
                  {crossSellProductId &&
                    `クロスセル: ${products.find((p) => p.id === crossSellProductId)?.name ?? "未設定"}`}
                </span>
              )}
            </p>
          ) : node.type === "message" ? (
            <div className="rounded bg-neutral-50 p-2 text-xs whitespace-pre-wrap">
              {truncate(text, 40) || "(未設定)"}
              {imageUrl && <p className="mt-1 text-neutral-400">画像: {imageUrl}</p>}
            </div>
          ) : node.type === "image" ? (
            <div className="rounded bg-neutral-50 p-2 text-xs">
              {imageUrls.filter(Boolean).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {imageUrls
                    .filter(Boolean)
                    .map((url, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={idx}
                        src={url}
                        alt=""
                        className="h-16 w-16 rounded border border-neutral-200 object-cover"
                      />
                    ))}
                </div>
              ) : (
                "(未設定)"
              )}
              {imageLinkUrl && <p className="mt-1 text-neutral-400">リンク: {imageLinkUrl}</p>}
              {imageCaption && <p className="mt-1 text-neutral-500">{imageCaption}</p>}
            </div>
          ) : node.type === "survey" ? (
            <div className="rounded bg-neutral-50 p-2 text-xs">
              {surveyQuestions.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {surveyQuestions.map((q, idx) => (
                    <li key={idx}>
                      {q.label || "(未設定)"}
                      <span className="ml-1 text-neutral-400">
                        [{SURVEY_ANSWER_TYPE_LABELS[q.type ?? "text_short"]}
                        {(q.type === "checkbox" || q.type === "radio") &&
                          `・${(q.options ?? []).length}択${q.allowOther ? "+その他" : ""}`}
                        ]
                      </span>
                      {q.required && <span className="ml-1 text-red-500">(必須)</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                "(質問未設定)"
              )}
            </div>
          ) : (
            <div className="rounded bg-neutral-50 p-2 text-xs whitespace-pre-wrap">
              {truncate(text, 40) || "(未設定)"}
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
                    if (o.qaProductId) {
                      const groupName =
                        products.find((p) => p.id === o.qaProductId)?.productGroupName ?? "未設定";
                      return `${o.label || o.value}→Q&A表示(${groupName})`;
                    }
                    const target = nodeOptions.find((n) => n.id === o.nextNodeId);
                    return target ? `${o.label || o.value}→${target.summary}` : null;
                  })
                  .filter(Boolean)
                  .join("、") ||
                (nodeOptions.find((n) => n.id === defaultNext)?.summary ?? "自動: 一覧の次のノードへ進む")
              : node.type === "product"
                ? productIds
                    .map((id) => {
                      const target = nodeOptions.find((n) => n.id === productNextMap[id]);
                      const product = products.find((p) => p.id === id);
                      return target && product ? `${product.name}→${target.summary}` : null;
                    })
                    .filter(Boolean)
                    .join("、") ||
                  (nodeOptions.find((n) => n.id === defaultNext)?.summary ?? "自動: 一覧の次のノードへ進む")
                : (nodeOptions.find((n) => n.id === defaultNext)?.summary ?? "自動: 一覧の次のノードへ進む")}
          </p>
        </>
      )}
    </div>
  );
}
