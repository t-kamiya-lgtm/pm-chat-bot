"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Coupon,
  MenuItemActionType,
  Product,
  Scenario,
  ScenarioMenuItem,
  ScenarioNode,
  ScenarioNodeType,
  SurveyAnswerType,
  SurveyQuestion,
} from "@/lib/types";
import { DEFAULT_VIDEO_ASPECT_RATIO, detectAspectRatio, getVideoThumbnailUrl } from "@/lib/video-embed";
import { contrastTextColor, effectiveTextColor, type TextColorOverride } from "@/lib/color";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Toast } from "@/components/admin/Toast";
import { ErrorDialog } from "@/components/admin/ErrorDialog";

type ToastState = { message: string; type: "success" | "error" } | null;
type ErrorDialogState = { title: string; description?: string; items?: string[] } | null;

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
  video: "動画表示",
  survey: "アンケート",
  coupon: "クーポン表示",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  one_time: "単品",
  subscription: "定期",
};

const BACKGROUND_COLOR_PALETTE = [
  // ニュートラル
  "#FFFFFF",
  "#FAFAF9",
  "#F5F5F4",
  "#E7E5E4",
  "#D4D4D4",
  "#A3A3A3",
  "#525252",
  "#262626",
  "#111827",
  "#000000",
  // 赤・ピンク
  "#FFF1F2",
  "#FFE4E6",
  "#FECDD3",
  "#FB7185",
  "#E11D48",
  // オレンジ
  "#FFF7ED",
  "#FFEDD5",
  "#FDBA74",
  "#F97316",
  // 黄
  "#FEFCE8",
  "#FEF3C7",
  "#FDE68A",
  "#EAB308",
  // 緑
  "#ECFDF5",
  "#D1FAE5",
  "#6EE7B7",
  "#10B981",
  // 青緑・水色
  "#F0FDFA",
  "#CCFBF1",
  "#5EEAD4",
  "#0D9488",
  // 青
  "#EFF6FF",
  "#DBEAFE",
  "#93C5FD",
  "#2563EB",
  // 紫
  "#FDF4FF",
  "#F3E8FF",
  "#D8B4FE",
  "#9333EA",
];

const DEFAULT_BACKGROUND_COLOR = "#FFFFFF";
// 各項目が未設定(null)のとき、実際のチャット画面(ChatWidget/MessageBubble)側で使われている
// 本当のデフォルト色。編集画面のプレビュー・色選択UIも、これに合わせて表示する必要がある。
const DEFAULT_CHAT_BACKGROUND_COLOR = "#FEFCE8"; // Tailwind yellow-50 (bg-yellow-50)
const DEFAULT_MESSAGE_BACKGROUND_COLOR = "#F5F5F4";
const DEFAULT_USER_MESSAGE_BACKGROUND_COLOR = "#171717";

/**
 * 横スクロール1列に、現在の色・#カラーコード直接入力・パレット一覧を並べた色選択UI。
 * 未設定(null)の場合もデフォルト色(白)が選択済みであることが分かるようにする。
 */
function ColorSwatchStrip({
  label,
  value,
  onChange,
  textColor,
  onTextColorChange,
  defaultColor = DEFAULT_BACKGROUND_COLOR,
}: {
  label: string;
  value: string | null;
  onChange: (color: string | null) => void;
  /** 指定すると、現在の色の下に「自動/白/黒」のテキスト色切り替えを表示する。 */
  textColor?: TextColorOverride;
  onTextColorChange?: (color: TextColorOverride) => void;
  /** 未設定(null)時に実際のチャット画面で使われる本当のデフォルト色。項目ごとに異なる。 */
  defaultColor?: string;
}) {
  const effective = value ?? defaultColor;
  const autoTextColor = contrastTextColor(effective);
  const [hexInput, setHexInput] = useState(effective);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setHexInput(value ?? defaultColor);
    });
    return () => {
      cancelled = true;
    };
  }, [value, defaultColor]);

  function commitHex() {
    const v = hexInput.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      onChange(v);
    } else {
      setHexInput(effective);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-neutral-600">{label}</span>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-xs text-blue-600 hover:underline">
            デフォルトに戻す
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-white pr-2">
          <span
            aria-label="現在の色"
            className="h-8 w-8 shrink-0 rounded-full border-2 border-neutral-300"
            style={{ backgroundColor: effective }}
          />
          <input
            className="input h-8 w-28 shrink-0 px-2"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitHex();
            }}
          />
        </div>
        {BACKGROUND_COLOR_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            onClick={() => onChange(color)}
            className={`h-8 w-8 shrink-0 rounded-full border-2 ${
              effective.toLowerCase() === color.toLowerCase() ? "border-blue-600" : "border-neutral-200"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      {onTextColorChange && (
        <div className="mt-2 flex items-center gap-3 text-xs text-neutral-600">
          <span>テキスト色:</span>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={!textColor}
              onChange={() => onTextColorChange(null)}
            />
            自動({autoTextColor === "white" ? "白" : "黒"})
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={textColor === "white"}
              onChange={() => onTextColorChange("white")}
            />
            白
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={textColor === "black"}
              onChange={() => onTextColorChange("black")}
            />
            黒
          </label>
        </div>
      )}
    </div>
  );
}

interface DisplaySettings {
  chatBackgroundColor: string | null;
  menuBackgroundColor: string | null;
  menuTextColor: TextColorOverride;
  messageBackgroundColor: string | null;
  messageTextColor: TextColorOverride;
  userMessageBackgroundColor: string | null;
  userMessageTextColor: TextColorOverride;
  headerMode: "image" | "title" | null;
  headerImageUrl: string;
  headerTitle: string;
  headerBackgroundColor: string | null;
  headerTextColor: TextColorOverride;
}

/** 9:16の携帯風プレビュー。クリックすると実際のチャット画面を新しいタブで開く。 */
function DisplayPreview({
  scenarioId,
  slug,
  display,
}: {
  scenarioId: string;
  slug: string | null;
  display: DisplaySettings;
}) {
  function openWidget() {
    const url = slug ? `/widget/${slug}?preview=1` : `/widget?scenarioId=${scenarioId}&preview=1`;
    window.open(url, "_blank");
  }

  return (
    <div className="shrink-0 space-y-2">
      <button
        type="button"
        onClick={openWidget}
        title="クリックして実際のチャット画面を確認"
        className="block h-[280px] w-[158px] overflow-hidden rounded-xl border border-neutral-300 shadow-sm"
      >
      <div
        className="flex h-full flex-col text-left"
        style={{ backgroundColor: display.chatBackgroundColor ?? DEFAULT_CHAT_BACKGROUND_COLOR }}
      >
        {display.headerMode === "image" && display.headerImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={display.headerImageUrl} alt="" className="h-8 w-full shrink-0 object-cover" />
        ) : display.headerMode === "title" ? (
          <div
            className="shrink-0 truncate px-2 py-1.5 text-[10px] font-medium"
            style={{
              backgroundColor: display.headerBackgroundColor ?? DEFAULT_BACKGROUND_COLOR,
              color: effectiveTextColor(display.headerBackgroundColor, display.headerTextColor),
            }}
          >
            {display.headerTitle || "ヘッダー"}
          </div>
        ) : null}
        <div className="flex-1 space-y-1.5 p-2">
          <div
            className="max-w-[75%] rounded-lg px-2 py-1 text-[9px]"
            style={{
              backgroundColor: display.messageBackgroundColor ?? "#F5F5F4",
              color: effectiveTextColor(display.messageBackgroundColor ?? "#F5F5F4", display.messageTextColor),
            }}
          >
            こんにちは
          </div>
          <div
            className="ml-auto max-w-[75%] rounded-lg px-2 py-1 text-[9px]"
            style={{
              backgroundColor: display.userMessageBackgroundColor ?? "#171717",
              color: effectiveTextColor(
                display.userMessageBackgroundColor ?? "#171717",
                display.userMessageTextColor,
              ),
            }}
          >
            こんにちは
          </div>
        </div>
        <div
          className="shrink-0 border-t border-neutral-200 p-1.5 text-center text-[9px]"
          style={{
            backgroundColor: display.menuBackgroundColor ?? DEFAULT_BACKGROUND_COLOR,
            color: effectiveTextColor(display.menuBackgroundColor, display.menuTextColor),
          }}
        >
          固定メニュー
        </div>
      </div>
      </button>
    </div>
  );
}

type PickableProduct = Pick<Product, "id" | "name" | "price" | "orderType"> & {
  /** 商品マスタの1枚目の画像。アップセル・クロスセルの画像URL未入力時の既定値として使う。 */
  imageUrl: string | null;
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

/**
 * 対象商品が単品の場合、定期対応品はクロスセル候補から除外する。
 * 単品×定期クロスセルは、クロスセル側の定期申込・2回目以降の注文を作れないため組み合わせ自体を禁止する
 * (対象商品が定期の場合は、同一周期の定期同時申込として対応済みなので制限しない)。
 */
function crossSellCandidates(products: PickableProduct[], mainProductId: string | undefined): PickableProduct[] {
  const mainProduct = products.find((p) => p.id === mainProductId);
  if (mainProduct && mainProduct.orderType === "subscription") return products;
  return products.filter((p) => p.orderType !== "subscription");
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
    // Q&Aをその場で表示するproductIdと、Q&Aを閉じた時/「購入へ進む」ボタンで進む次のノードIDを、"|"区切りで両方保持する
    if (o.qaProductId) map[o.value.trim()] = `${QA_TARGET_PREFIX}${o.qaProductId}|${o.nextNodeId ?? ""}`;
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
    const [productId, nextNodeId] = target.slice(QA_TARGET_PREFIX.length).split("|");
    return { nextNodeId: nextNodeId ?? "", qaProductId: productId };
  }
  return { nextNodeId: target };
}

const CHECKOUT_LINK_ERROR_TITLE = "決済導線ノードへは接続できません";
const CHECKOUT_LINK_ERROR_DESCRIPTION =
  "商品を選ばずに決済フォームへ入る導線になり、シナリオとして成立しません。\n" +
  "決済フォームへは「商品提示」ノードで商品を選んだあと自動的に進みます。接続先を商品提示ノードに変更してください。";

/** next_node_mapの値(Q&A sentinelを含む)から、実際に遷移するノードIDを取り出す。 */
function resolveTargetNodeIds(target: string): string[] {
  if (!target) return [];
  if (target.startsWith(QA_TARGET_PREFIX)) {
    // "qa:<productId>|<nextNodeId>" — Q&Aを閉じた時/「購入へ進む」で進む先が実ノード
    const nextNodeId = target.slice(QA_TARGET_PREFIX.length).split("|")[1];
    return nextNodeId ? [nextNodeId] : [];
  }
  return [target];
}

/**
 * 決済導線ノードへ直接つながっている接続を洗い出す。
 * 商品提示ノードは保存時に自動で紐付けを解除するため対象外。
 */
function findCheckoutLinks(nodes: ScenarioNode[], products: PickableProduct[]): string[] {
  const checkoutNodes = new Map(nodes.filter((n) => n.type === "checkout").map((n) => [n.id, n]));
  if (checkoutNodes.size === 0) return [];

  const found: string[] = [];
  const entryNode = nodes[0];
  if (entryNode && entryNode.type === "checkout") {
    found.push(`開始ノードが「決済導線: ${truncate(nodeSummary(entryNode, products), 40)}」になっています`);
  }
  for (const node of nodes) {
    if (node.type === "product" || node.type === "checkout") continue;
    for (const target of Object.values(node.nextNodeMap)) {
      for (const targetId of resolveTargetNodeIds(target)) {
        const checkoutNode = checkoutNodes.get(targetId);
        if (!checkoutNode) continue;
        found.push(
          `「${NODE_TYPE_LABELS[node.type]}: ${truncate(nodeSummary(node, products), 30)}」→` +
            `「決済導線: ${truncate(nodeSummary(checkoutNode, products), 30)}」`,
        );
      }
    }
  }
  return found;
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
    case "video":
      return `動画表示: ${truncate((node.content.caption as string) || (node.content.videoUrl as string) || "")}`;
    case "survey":
      return `アンケート: ${((node.content.questions as SurveyQuestion[] | undefined) ?? []).length}件の質問`;
    case "coupon":
      return "クーポン表示(このシナリオの自動適用クーポンを表示)";
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

      {type === "product" && selectedIds.length > 0 && (
        <div className="space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-2">
          <p className="text-xs font-medium text-neutral-500">選択中(カルーセルの表示順)</p>
          {selectedIds.map((id, index) => {
            const product = products.find((p) => p.id === id);
            return (
              <div key={id} className="flex items-center gap-2 text-xs">
                <span className="w-5 text-center font-medium text-neutral-400">{index + 1}</span>
                <span className="flex-1 truncate">{product ? productLabel(product) : id}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (index === 0) return;
                    const next = [...selectedIds];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    onChange(next);
                  }}
                  disabled={index === 0}
                  className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (index === selectedIds.length - 1) return;
                    const next = [...selectedIds];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    onChange(next);
                  }}
                  disabled={index === selectedIds.length - 1}
                  className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => onChange(selectedIds.filter((sid) => sid !== id))}
                  className="text-red-600 hover:underline"
                >
                  削除
                </button>
              </div>
            );
          })}
        </div>
      )}

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
      <p className={`text-neutral-400 ${compact ? "text-[11px]" : "text-xs"}`}>
        推奨比率: 1枚のみの場合は横長など任意の比率で表示されます。2枚以上登録する場合は正方形(1:1)推奨(カルーセル表示時は正方形に切り取られます)
      </p>
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

/** アップセル・クロスセルの品番選択。対象商品の選択と揃え、アイテム→品番の二段階で選ばせる(任意設定可)。 */
function OptionalProductSelect({
  products,
  value,
  onChange,
  label,
  emptyLabel,
  compact,
}: {
  products: PickableProduct[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  emptyLabel?: string;
  compact?: boolean;
}) {
  const groups = Array.from(
    new Map(
      products.map((p) => [
        p.productGroupId ?? UNGROUPED_KEY,
        { id: p.productGroupId ?? UNGROUPED_KEY, name: p.productGroupName ?? "未分類" },
      ]),
    ).values(),
  );

  const groupIdForValue = (id: string) => {
    const selected = products.find((p) => p.id === id);
    return selected ? (selected.productGroupId ?? UNGROUPED_KEY) : undefined;
  };

  // 未設定のときは先頭のアイテムを勝手に選ばず「設定しない」を表示する
  const [selectedGroupId, setSelectedGroupId] = useState(() => groupIdForValue(value) ?? "");

  // valueが外部から変わった(編集フォームを開き直した等)場合のみ、選択中のアイテムを追従させる。
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    const groupId = groupIdForValue(value);
    if (groupId) setSelectedGroupId(groupId);
  }

  const labelClass = `mb-1 block font-medium ${compact ? "text-neutral-500" : "text-neutral-700"}`;

  if (products.length === 0) {
    return (
      <div className={compact ? "text-xs" : "text-sm"}>
        <span className={labelClass}>{label}</span>
        <p className="text-xs text-amber-700">商品が登録されていません。</p>
      </div>
    );
  }

  const productsInGroup = products.filter((p) => (p.productGroupId ?? UNGROUPED_KEY) === selectedGroupId);

  const selectedProduct = products.find((p) => p.id === value);

  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <span className={labelClass}>{label}</span>
      <div className="flex flex-col gap-1">
        <select
          className="input w-full"
          value={selectedGroupId}
          onChange={(e) => {
            setSelectedGroupId(e.target.value);
            onChange("");
          }}
        >
          {/* アイテム側でも「設定しない」を選べるようにする(商品を選ぶ前から未設定であることが分かるように) */}
          <option value="">{emptyLabel ?? "設定しない"}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <select className="input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{emptyLabel ?? "設定しない"}</option>
          {productsInGroup.map((product) => (
            <option key={product.id} value={product.id}>
              {productLabel(product)}
            </option>
          ))}
        </select>
        {selectedProduct && (
          <p className="break-words whitespace-normal text-neutral-500">{productLabel(selectedProduct)}</p>
        )}
      </div>
    </div>
  );
}

/** 商品ごとのアップセル・クロスセル設定(任意)。checkoutノード自身の設定より優先して使われる。 */
interface ProductUpsellEntry {
  upsellProductId?: string;
  upsellImageUrl?: string;
  upsellComment?: string;
  crossSellProductId?: string;
  crossSellImageUrl?: string;
  crossSellComment?: string;
}

/** 決済導線ノードのcontentに設定されたアップセル・クロスセルを、マトリクス1件分の形に変換する。 */
function upsellEntryFromCheckoutNode(target: ScenarioNode | undefined): ProductUpsellEntry | undefined {
  if (!target || target.type !== "checkout") return undefined;
  const content = target.content as Record<string, string | undefined>;
  if (!content.upsellProductId && !content.crossSellProductId) return undefined;
  return {
    upsellProductId: content.upsellProductId || undefined,
    upsellImageUrl: content.upsellImageUrl || undefined,
    upsellComment: content.upsellComment || undefined,
    crossSellProductId: content.crossSellProductId || undefined,
    crossSellImageUrl: content.crossSellImageUrl || undefined,
    crossSellComment: content.crossSellComment || undefined,
  };
}

/**
 * 旧仕様(商品提示ノード + 決済導線ノードの2ノード構成)で決済導線ノード側に設定されていた
 * アップセル・クロスセルを、商品提示ノードのマトリクスへ引き継ぐ。
 * 商品提示ノード自身の設定(content.productUpsell)を最優先とし、未設定の商品についてのみ
 * ①その商品の遷移先の決済導線ノード ②共通の遷移先の決済導線ノード
 * ③同じ品番を対象にしている決済導線ノード の順に探して補完する。
 */
function inheritUpsellFromCheckoutNodes(
  node: ScenarioNode,
  allNodes: ScenarioNode[],
): Record<string, ProductUpsellEntry> {
  const own = (node.content.productUpsell as Record<string, ProductUpsellEntry> | undefined) ?? {};
  if (node.type !== "product") return own;

  const checkoutNodes = allNodes.filter((n) => n.type === "checkout");
  if (checkoutNodes.length === 0) return own;

  const merged = { ...own };
  for (const productId of extractProductIds(node.content)) {
    if (merged[productId]) continue;
    const inherited =
      upsellEntryFromCheckoutNode(checkoutNodes.find((n) => n.id === node.nextNodeMap[productId])) ??
      upsellEntryFromCheckoutNode(checkoutNodes.find((n) => n.id === node.nextNodeMap.default)) ??
      upsellEntryFromCheckoutNode(checkoutNodes.find((n) => n.content.productId === productId));
    if (inherited) merged[productId] = inherited;
  }
  return merged;
}

/**
 * 商品(カルーセルに表示する品番と表示順)と、商品ごとのアップセル・クロスセルを
 * 商品を横に並べたマトリクス形式でまとめて設定する。
 * 「どの品番を表示するか」のチェックリストと「アップセル・クロスセルの紐付け」が
 * 別々のUIに分かれていたのを1つに統合し、この一覧だけで完結するようにしている。
 * 各商品を選んだ際は共通の決済フォームへ直接進むため、個別に決済導線ノードを
 * 指定する必要はない(商品ごとの「次のノード」設定は廃止)。
 */
function ProductUpsellMatrixEditor({
  productIds,
  onProductIdsChange,
  products,
  value,
  onChange,
  inheritedCount,
}: {
  productIds: string[];
  onProductIdsChange: (ids: string[]) => void;
  products: PickableProduct[];
  value: Record<string, ProductUpsellEntry>;
  onChange: (map: Record<string, ProductUpsellEntry>) => void;
  /** 旧仕様の決済導線ノードから引き継いだ件数(0件のときは通知を出さない) */
  inheritedCount?: number;
}) {
  function updateEntry(productId: string, patch: Partial<ProductUpsellEntry>) {
    if (!productId) return;
    onChange({ ...value, [productId]: { ...value[productId], ...patch } });
  }

  function updateSlot(index: number, productId: string) {
    onProductIdsChange(productIds.map((id, i) => (i === index ? productId : id)));
  }
  function removeSlot(index: number) {
    onProductIdsChange(productIds.filter((_, i) => i !== index));
  }
  function moveSlot(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= productIds.length) return;
    const next = [...productIds];
    [next[index], next[target]] = [next[target], next[index]];
    onProductIdsChange(next);
  }

  return (
    <div className="space-y-2 rounded-md border border-neutral-200 p-3">
      <span className="block text-xs font-medium text-neutral-500">
        表示する商品(カルーセルの表示順)と、商品ごとのアップセル・クロスセル(任意。
        その商品が選ばれた際に決済確認画面で提案します)
      </span>
      {Boolean(inheritedCount) && (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">
          決済導線ノード側に設定されていたアップセル・クロスセル{inheritedCount}件を引き継いで表示しています。
          「更新する」で保存すると、この商品提示ノードだけで完結し、決済導線ノードは不要になります。
        </p>
      )}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {productIds.map((id, index) => {
          const entry = value[id] ?? {};
          // 他のスロットで既に選ばれている商品は、この商品選択の候補から除外する(重複表示を防ぐ)
          const availableProducts = products.filter((p) => p.id === id || !productIds.includes(p.id));
          const upsellProduct = products.find((p) => p.id === entry.upsellProductId);
          const crossSellProduct = products.find((p) => p.id === entry.crossSellProductId);
          return (
            <div
              key={index}
              className="w-64 shrink-0 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-700">商品{index + 1}</span>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => moveSlot(index, -1)}
                    disabled={index === 0}
                    className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlot(index, 1)}
                    disabled={index === productIds.length - 1}
                    className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                  >
                    ▶
                  </button>
                  <button type="button" onClick={() => removeSlot(index)} className="text-red-600 hover:underline">
                    削除
                  </button>
                </div>
              </div>
              <OptionalProductSelect
                label="商品"
                products={availableProducts}
                value={id}
                onChange={(v) => updateSlot(index, v)}
                emptyLabel="選択してください"
                compact
              />
              <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2">
                <span className="block text-xs font-medium text-amber-800">アップセル</span>
                <OptionalProductSelect
                  label="商品"
                  products={products}
                  value={entry.upsellProductId ?? ""}
                  onChange={(v) => updateEntry(id, { upsellProductId: v || undefined })}
                  compact
                />
                {entry.upsellProductId && (
                  <>
                    <input
                      className="input text-xs"
                      placeholder={upsellProduct?.imageUrl ?? "画像URL(任意)"}
                      value={entry.upsellImageUrl ?? ""}
                      onChange={(e) => updateEntry(id, { upsellImageUrl: e.target.value || undefined })}
                    />
                    <p className="text-xs text-neutral-500">
                      画像URLは未入力で構いません(商品マスタの1枚目の画像を使用します)。別の画像にしたい場合のみ入力してください。
                    </p>
                    <textarea
                      className="input text-xs"
                      rows={2}
                      placeholder="案内文(任意)"
                      value={entry.upsellComment ?? ""}
                      onChange={(e) => updateEntry(id, { upsellComment: e.target.value || undefined })}
                    />
                  </>
                )}
              </div>
              <div className="space-y-1 rounded-md border border-sky-200 bg-sky-50 p-2">
                <span className="block text-xs font-medium text-sky-800">クロスセル</span>
                <OptionalProductSelect
                  label="商品"
                  products={crossSellCandidates(products, id)}
                  value={entry.crossSellProductId ?? ""}
                  onChange={(v) => updateEntry(id, { crossSellProductId: v || undefined })}
                  compact
                />
                {entry.crossSellProductId && (
                  <>
                    <input
                      className="input text-xs"
                      placeholder={crossSellProduct?.imageUrl ?? "画像URL(任意)"}
                      value={entry.crossSellImageUrl ?? ""}
                      onChange={(e) => updateEntry(id, { crossSellImageUrl: e.target.value || undefined })}
                    />
                    <p className="text-xs text-neutral-500">
                      画像URLは未入力で構いません(商品マスタの1枚目の画像を使用します)。別の画像にしたい場合のみ入力してください。
                    </p>
                    <textarea
                      className="input text-xs"
                      rows={2}
                      placeholder="案内文(任意)"
                      value={entry.crossSellComment ?? ""}
                      onChange={(e) => updateEntry(id, { crossSellComment: e.target.value || undefined })}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex w-64 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-neutral-300 p-4">
          <button
            type="button"
            onClick={() => onProductIdsChange([...productIds, ""])}
            className="text-sm text-blue-600 hover:underline"
          >
            + 商品を追加
          </button>
        </div>
      </div>
      {productIds.length === 0 && (
        <p className="text-xs text-neutral-400">まだ商品が追加されていません。「+ 商品を追加」から追加してください。</p>
      )}
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
            label="Q&Aをその場で表示するアイテム(設定すると、この選択肢では次のノードへ進む前にQ&Aを表示します)"
            products={products}
            value={option.qaProductId ?? ""}
            onChange={(id) => update(index, { qaProductId: id || undefined })}
            allowEmpty
            compact={compact}
          />
          <NextNodeSelect
            label={
              option.qaProductId
                ? "Q&Aを閉じた時・Q&A表示中の「購入へ進む」ボタンで進むノード"
                : "この選択肢を選んだ時に進むノード"
            }
            nodeOptions={nodeOptions}
            value={option.nextNodeId}
            onChange={(v) => update(index, { nextNodeId: v })}
            compact={compact}
          />
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

function Accordion({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="mb-4 rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <h2 className="text-base font-semibold text-neutral-800">{title}</h2>
        <span className={`text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="space-y-6 border-t border-neutral-200 p-4">
          {children}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}

function EmbedSnippet({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-neutral-600">{label}</span>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(code)}
          className="text-sm text-blue-600 hover:underline"
        >
          コピー
        </button>
      </div>
      <pre className="overflow-x-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * ノード間の「隙間」に表示するドラッグ移動先ガイド。ドラッグ中でなければ通常の行間スペースとして機能し、
 * ドラッグ中にこの隙間へホバーすると青い線が表示され、その状態で指を離すとそこへ移動する
 * (線が出ていない場所で離した場合は何も起きず、元の位置のままになる)。
 */
function DropGuide({
  active,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className="relative h-3"
    >
      {active && (
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-blue-500" />
      )}
    </div>
  );
}

interface Props {
  scenario: Scenario;
  nodes: ScenarioNode[];
  products: PickableProduct[];
  menuItems: ScenarioMenuItem[];
  coupon: Coupon | null;
}

export function ScenarioEditor({
  scenario,
  nodes,
  products,
  menuItems: initialMenuItems,
  coupon: initialCoupon,
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastState>(null);
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState>(null);
  const [publishing, setPublishing] = useState(false);
  const [editingScenarioName, setEditingScenarioName] = useState(false);
  const [scenarioNameDraft, setScenarioNameDraft] = useState(scenario.name);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState(scenario.slug ?? "");
  const [editingOrderCode, setEditingOrderCode] = useState(false);
  const [orderCodeDraft, setOrderCodeDraft] = useState(scenario.orderCode ?? "");
  const [display, setDisplay] = useState<DisplaySettings>({
    chatBackgroundColor: scenario.chatBackgroundColor,
    menuBackgroundColor: scenario.menuBackgroundColor,
    menuTextColor: scenario.menuTextColor,
    messageBackgroundColor: scenario.messageBackgroundColor,
    messageTextColor: scenario.messageTextColor,
    userMessageBackgroundColor: scenario.userMessageBackgroundColor,
    userMessageTextColor: scenario.userMessageTextColor,
    headerMode: scenario.headerMode,
    headerImageUrl: scenario.headerImageUrl ?? "",
    headerTitle: scenario.headerTitle ?? "",
    headerBackgroundColor: scenario.headerBackgroundColor,
    headerTextColor: scenario.headerTextColor,
  });
  const [adTagDraft, setAdTagDraft] = useState(scenario.adTag ?? "");
  const [adTagSaving, setAdTagSaving] = useState(false);
  const [adTagSaved, setAdTagSaved] = useState(false);
  const adTagSkipResetRef = useRef(true);
  useEffect(() => {
    if (adTagSkipResetRef.current) {
      adTagSkipResetRef.current = false;
      return;
    }
    setAdTagSaved(false);
  }, [adTagDraft]);

  const [conversionTagDraft, setConversionTagDraft] = useState(scenario.conversionTag ?? "");
  const [conversionTagSaving, setConversionTagSaving] = useState(false);
  const [conversionTagSaved, setConversionTagSaved] = useState(false);
  const conversionTagSkipResetRef = useRef(true);
  useEffect(() => {
    if (conversionTagSkipResetRef.current) {
      conversionTagSkipResetRef.current = false;
      return;
    }
    setConversionTagSaved(false);
  }, [conversionTagDraft]);

  const [emailFromAddressDraft, setEmailFromAddressDraft] = useState(scenario.emailFromAddress ?? "");
  const [emailFromAddressSaving, setEmailFromAddressSaving] = useState(false);
  const [emailFromAddressSaved, setEmailFromAddressSaved] = useState(false);
  const emailFromAddressSkipResetRef = useRef(true);
  useEffect(() => {
    if (emailFromAddressSkipResetRef.current) {
      emailFromAddressSkipResetRef.current = false;
      return;
    }
    setEmailFromAddressSaved(false);
  }, [emailFromAddressDraft]);

  const [popupIconUrlDraft, setPopupIconUrlDraft] = useState(scenario.popupIconUrl ?? "");
  const [popupIconUrlSaving, setPopupIconUrlSaving] = useState(false);
  const [popupIconUrlSaved, setPopupIconUrlSaved] = useState(false);
  const popupIconUrlSkipResetRef = useRef(true);
  useEffect(() => {
    if (popupIconUrlSkipResetRef.current) {
      popupIconUrlSkipResetRef.current = false;
      return;
    }
    setPopupIconUrlSaved(false);
  }, [popupIconUrlDraft]);
  const [popupPosition, setPopupPositionState] = useState<"bottom-right" | "bottom-left">(
    scenario.popupPosition ?? "bottom-right",
  );
  const [couponCodeFieldEnabled, setCouponCodeFieldEnabledState] = useState(
    scenario.couponCodeFieldEnabled,
  );
  const [coupon, setCoupon] = useState<Coupon | null>(initialCoupon);
  const [couponForm, setCouponForm] = useState({
    name: initialCoupon?.name ?? "",
    discountType: initialCoupon?.discountType ?? ("percent" as "percent" | "fixed"),
    discountValue: initialCoupon ? String(initialCoupon.discountValue) : "",
    startsAt: initialCoupon?.startsAt ? initialCoupon.startsAt.slice(0, 10) : "",
    endsAt: initialCoupon?.endsAt ? initialCoupon.endsAt.slice(0, 10) : "",
    maxUses: initialCoupon?.maxUses ? String(initialCoupon.maxUses) : "",
    minOrderAmount: initialCoupon?.minOrderAmount ? String(initialCoupon.minOrderAmount) : "",
    imageUrl: initialCoupon?.imageUrl ?? "",
    promoMessage: initialCoupon?.promoMessage ?? "",
  });
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponSaved, setCouponSaved] = useState(false);
  const couponSkipResetRef = useRef(true);
  useEffect(() => {
    if (couponSkipResetRef.current) {
      couponSkipResetRef.current = false;
      return;
    }
    setCouponSaved(false);
  }, [couponForm]);
  const [newNodeType, setNewNodeType] = useState<ScenarioNodeType>("message");
  const [newNodeProductIds, setNewNodeProductIds] = useState<string[]>([]);
  const [newNodeProductUpsell, setNewNodeProductUpsell] = useState<Record<string, ProductUpsellEntry>>({});
  const [newNodeText, setNewNodeText] = useState("");
  const [newNodeImageUrl, setNewNodeImageUrl] = useState("");
  const [newNodeImageUrls, setNewNodeImageUrls] = useState<string[]>([""]);
  const [newNodeImageLinkUrl, setNewNodeImageLinkUrl] = useState("");
  const [newNodeImageCaption, setNewNodeImageCaption] = useState("");
  const [newNodeVideoUrl, setNewNodeVideoUrl] = useState("");
  const [newNodeVideoAspectRatio, setNewNodeVideoAspectRatio] = useState(DEFAULT_VIDEO_ASPECT_RATIO);
  const [newNodeVideoDetecting, setNewNodeVideoDetecting] = useState(false);
  const [newNodeVideoCaption, setNewNodeVideoCaption] = useState("");

  async function handleDetectNewNodeAspectRatio() {
    if (!newNodeVideoUrl.trim()) return;
    setNewNodeVideoDetecting(true);
    try {
      setNewNodeVideoAspectRatio(await detectAspectRatio(newNodeVideoUrl.trim()));
    } catch {
      setNewNodeVideoAspectRatio(DEFAULT_VIDEO_ASPECT_RATIO);
    } finally {
      setNewNodeVideoDetecting(false);
    }
  }
  const [newNodeSurveyIntro, setNewNodeSurveyIntro] = useState("");
  const [newNodeSurveyQuestions, setNewNodeSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [newNodeChoiceText, setNewNodeChoiceText] = useState("");
  const [newNodeOptions, setNewNodeOptions] = useState<OptionDraft[]>([]);
  const [newNodeDefaultNext, setNewNodeDefaultNext] = useState("");
  const [newNodeIsEntry, setNewNodeIsEntry] = useState(nodes.length === 0);
  const [newNodeMemo, setNewNodeMemo] = useState("");
  const [reorderPending, setReorderPending] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverGap, setDragOverGap] = useState<number | null>(null);
  const [menuItems, setMenuItems] = useState<ScenarioMenuItem[]>(initialMenuItems);
  const [newMenuLabel, setNewMenuLabel] = useState("");
  const [newMenuActionType, setNewMenuActionType] = useState<MenuItemActionType>("node");
  const [newMenuTargetNodeId, setNewMenuTargetNodeId] = useState("");
  const [newMenuUrl, setNewMenuUrl] = useState("");
  const [menuPending, setMenuPending] = useState<string | null>(null);
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [editMenuLabel, setEditMenuLabel] = useState("");
  const [editMenuActionType, setEditMenuActionType] = useState<MenuItemActionType>("node");
  const [editMenuTargetNodeId, setEditMenuTargetNodeId] = useState("");
  const [editMenuUrl, setEditMenuUrl] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setOrigin(window.location.origin);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const nodeOptions = nodes.map((n) => ({ id: n.id, summary: nodeSummary(n, products) }));

  async function togglePublish() {
    // 公開時のみ検証する(下書きに戻す操作は途中の状態でも通す)
    if (scenario.status !== "published") {
      const invalidLinks = findCheckoutLinks(nodes, products);
      if (invalidLinks.length > 0) {
        setErrorDialog({
          title: CHECKOUT_LINK_ERROR_TITLE,
          description: `次の接続があるため公開できません。\n${CHECKOUT_LINK_ERROR_DESCRIPTION}`,
          items: invalidLinks,
        });
        return;
      }
    }
    setPublishing(true);
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: scenario.status === "published" ? "draft" : "published" }),
    });
    setPublishing(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `公開状態の変更に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    router.refresh();
  }

  async function handleRenameScenario() {
    const name = scenarioNameDraft.trim();
    if (!name || name === scenario.name) {
      setEditingScenarioName(false);
      return;
    }

    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `名称の変更に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setEditingScenarioName(false);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
  }

  async function handleEditSlug() {
    const trimmed = slugDraft.trim();
    const slug = trimmed ? trimmed : null;
    if (slug === scenario.slug) {
      setEditingSlug(false);
      return;
    }

    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `公開用URLの設定に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setEditingSlug(false);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
  }

  async function handleEditOrderCode() {
    const trimmed = orderCodeDraft.trim();
    const orderCode = trimmed ? trimmed : null;
    if (orderCode === scenario.orderCode) {
      setEditingOrderCode(false);
      return;
    }

    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderCode }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `識別コードの設定に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setEditingOrderCode(false);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
  }

  /**
   * 表示設定(色・ヘッダー)はその場で見た目に反映してから裏でPATCHする(router.refreshを待たない)。
   * 保存に失敗した場合のみ、失敗したことをトースト表示で知らせる(元の値には戻さない=次の操作で再送すれば直る)。
   */
  async function patchDisplaySettings(payload: Record<string, unknown>) {
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `表示設定の保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
    }
  }

  function setColorField(
    field:
      | "chatBackgroundColor"
      | "menuBackgroundColor"
      | "messageBackgroundColor"
      | "userMessageBackgroundColor"
      | "headerBackgroundColor",
    value: string | null,
  ) {
    setDisplay((prev) => ({ ...prev, [field]: value }));
    patchDisplaySettings({ [field]: value });
  }

  function setTextColorField(
    field: "headerTextColor" | "messageTextColor" | "userMessageTextColor" | "menuTextColor",
    value: TextColorOverride,
  ) {
    setDisplay((prev) => ({ ...prev, [field]: value }));
    patchDisplaySettings({ [field]: value });
  }

  function setHeaderMode(mode: "image" | "title" | null) {
    setDisplay((prev) => ({ ...prev, headerMode: mode }));
    patchDisplaySettings({ headerMode: mode });
  }

  function commitHeaderImageUrl() {
    patchDisplaySettings({ headerImageUrl: display.headerImageUrl.trim() || null });
  }

  function commitHeaderTitle() {
    patchDisplaySettings({ headerTitle: display.headerTitle.trim() || null });
  }

  async function handleSaveAdTag() {
    setAdTagSaving(true);
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adTag: adTagDraft.trim() || null }),
    });
    setAdTagSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `広告タグの保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setAdTagSaved(true);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
  }

  async function handleSaveConversionTag() {
    setConversionTagSaving(true);
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversionTag: conversionTagDraft.trim() || null }),
    });
    setConversionTagSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `コンバージョンタグの保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setConversionTagSaved(true);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
  }

  async function handleSaveEmailFromAddress() {
    setEmailFromAddressSaving(true);
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emailFromAddress: emailFromAddressDraft.trim() || null }),
    });
    setEmailFromAddressSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `送信元アドレスの保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setEmailFromAddressSaved(true);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
  }

  async function handleSavePopupIconUrl() {
    setPopupIconUrlSaving(true);
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ popupIconUrl: popupIconUrlDraft.trim() || null }),
    });
    setPopupIconUrlSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `アイコン画像の保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setPopupIconUrlSaved(true);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
  }

  function setPopupPosition(position: "bottom-right" | "bottom-left") {
    setPopupPositionState(position);
    patchDisplaySettings({ popupPosition: position });
  }

  function setCouponCodeFieldEnabled(enabled: boolean) {
    setCouponCodeFieldEnabledState(enabled);
    patchDisplaySettings({ couponCodeFieldEnabled: enabled });
  }

  async function handleSaveCoupon() {
    if (!couponForm.name.trim() || !couponForm.discountValue) {
      setToast({ message: "名称と割引額を入力してください", type: "error" });
      return;
    }
    setCouponSaving(true);
    const payload = {
      name: couponForm.name.trim(),
      discountType: couponForm.discountType,
      discountValue: Number(couponForm.discountValue),
      startsAt: couponForm.startsAt ? new Date(couponForm.startsAt).toISOString() : null,
      endsAt: couponForm.endsAt ? new Date(couponForm.endsAt).toISOString() : null,
      maxUses: couponForm.maxUses ? Number(couponForm.maxUses) : null,
      minOrderAmount: couponForm.minOrderAmount ? Number(couponForm.minOrderAmount) : null,
      imageUrl: couponForm.imageUrl.trim() || null,
      promoMessage: couponForm.promoMessage.trim() || null,
    };
    const res = coupon
      ? await fetch(`/api/coupons/${coupon.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/coupons", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, type: "scenario_auto", scenarioId: scenario.id }),
        });
    setCouponSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `クーポンの保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    const { coupon: saved } = await res.json();
    setCoupon({
      id: saved.id,
      type: saved.type,
      scenarioId: saved.scenario_id,
      code: saved.code,
      name: saved.name,
      discountType: saved.discount_type,
      discountValue: saved.discount_value,
      startsAt: saved.starts_at,
      endsAt: saved.ends_at,
      maxUses: saved.max_uses,
      usedCount: saved.used_count,
      minOrderAmount: saved.min_order_amount,
      isActive: saved.is_active,
      imageUrl: saved.image_url,
      promoMessage: saved.promo_message,
      createdAt: saved.created_at,
      updatedAt: saved.updated_at,
    });
    setCouponSaved(true);
    setToast({ message: "保存しました", type: "success" });
  }

  async function handleToggleCouponActive() {
    if (!coupon) return;
    setCouponSaving(true);
    const res = await fetch(`/api/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !coupon.isActive }),
    });
    setCouponSaving(false);
    if (!res.ok) {
      setToast({ message: "更新に失敗しました", type: "error" });
      return;
    }
    setCoupon({ ...coupon, isActive: !coupon.isActive });
    setToast({ message: "更新しました", type: "success" });
  }

  async function handleDeleteCoupon() {
    if (!coupon) return;
    setCouponSaving(true);
    const res = await fetch(`/api/coupons/${coupon.id}`, { method: "DELETE" });
    setCouponSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setCoupon(null);
    setCouponForm({
      name: "",
      discountType: "percent",
      discountValue: "",
      startsAt: "",
      endsAt: "",
      maxUses: "",
      minOrderAmount: "",
      imageUrl: "",
      promoMessage: "",
    });
    setToast({ message: "削除しました", type: "success" });
  }

  async function handleAddMenuItem(event: React.FormEvent) {
    event.preventDefault();

    if (!newMenuLabel.trim()) {
      setToast({ message: "ボタンのラベルを入力してください", type: "error" });
      return;
    }
    if (newMenuActionType === "node" && !newMenuTargetNodeId) {
      setToast({ message: "ジャンプ先のノードを選択してください", type: "error" });
      return;
    }
    if (newMenuActionType === "url" && !newMenuUrl.trim()) {
      setToast({ message: "URLを入力してください", type: "error" });
      return;
    }

    const res = await fetch(`/api/scenarios/${scenario.id}/menu-items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: newMenuLabel.trim(),
        actionType: newMenuActionType,
        ...(newMenuActionType === "node" && { targetNodeId: newMenuTargetNodeId }),
        ...(newMenuActionType === "url" && { url: newMenuUrl.trim() }),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `追加に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
      return;
    }
    const { menuItem } = await res.json();
    setMenuItems((prev) => [
      ...prev,
      {
        id: menuItem.id,
        scenarioId: menuItem.scenario_id,
        label: menuItem.label,
        actionType: menuItem.action_type,
        targetNodeId: menuItem.target_node_id,
        url: menuItem.url,
        displayOrder: menuItem.display_order,
      },
    ]);
    setNewMenuLabel("");
    setNewMenuTargetNodeId("");
    setNewMenuUrl("");
    setToast({ message: "追加しました", type: "success" });
  }

  async function handleDeleteMenuItem(item: ScenarioMenuItem) {
    setMenuPending(item.id);
    const res = await fetch(`/api/scenarios/${scenario.id}/menu-items/${item.id}`, { method: "DELETE" });
    setMenuPending(null);

    if (!res.ok) {
      setToast({ message: "削除に失敗しました", type: "error" });
      return;
    }
    setMenuItems((prev) => prev.filter((m) => m.id !== item.id));
  }

  async function moveMenuItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= menuItems.length) return;

    const current = menuItems[index];
    const target = menuItems[targetIndex];
    const next = [...menuItems];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setMenuItems(next);

    setMenuPending(current.id);
    const [resA, resB] = await Promise.all([
      fetch(`/api/scenarios/${scenario.id}/menu-items/${current.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayOrder: target.displayOrder }),
      }),
      fetch(`/api/scenarios/${scenario.id}/menu-items/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayOrder: current.displayOrder }),
      }),
    ]);
    setMenuPending(null);
    if (!resA.ok || !resB.ok) {
      setToast({ message: "並び替えに失敗しました", type: "error" });
    }
  }

  function startEditingMenuItem(item: ScenarioMenuItem) {
    setEditingMenuItemId(item.id);
    setEditMenuLabel(item.label);
    setEditMenuActionType(item.actionType);
    setEditMenuTargetNodeId(item.targetNodeId ?? "");
    setEditMenuUrl(item.url ?? "");
  }

  /** 固定メニュー項目の変更をその場でPATCHし、成功したらローカル状態も更新する(自動保存)。 */
  async function patchMenuItem(itemId: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/scenarios/${scenario.id}/menu-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `固定メニューの更新に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    const { menuItem } = await res.json();
    setMenuItems((prev) =>
      prev.map((m) =>
        m.id === itemId
          ? {
              ...m,
              label: menuItem.label,
              actionType: menuItem.action_type,
              targetNodeId: menuItem.target_node_id,
              url: menuItem.url,
              displayOrder: menuItem.display_order,
            }
          : m,
      ),
    );
  }

  function commitEditMenuLabel(itemId: string) {
    if (editMenuLabel.trim()) patchMenuItem(itemId, { label: editMenuLabel.trim() });
  }

  function handleEditMenuActionTypeChange(itemId: string, actionType: MenuItemActionType) {
    setEditMenuActionType(actionType);
    if (actionType === "node") {
      if (editMenuTargetNodeId) patchMenuItem(itemId, { actionType, targetNodeId: editMenuTargetNodeId, url: null });
    } else if (actionType === "url") {
      if (editMenuUrl.trim()) patchMenuItem(itemId, { actionType, url: editMenuUrl.trim(), targetNodeId: null });
    } else {
      patchMenuItem(itemId, { actionType, targetNodeId: null, url: null });
    }
  }

  function commitEditMenuTargetNodeId(itemId: string, targetNodeId: string) {
    setEditMenuTargetNodeId(targetNodeId);
    if (targetNodeId) patchMenuItem(itemId, { targetNodeId });
  }

  function commitEditMenuUrl(itemId: string) {
    if (editMenuUrl.trim()) patchMenuItem(itemId, { url: editMenuUrl.trim() });
  }

  async function handleDeleteScenario() {
    const res = await fetch(`/api/scenarios/${scenario.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
      return;
    }
    router.push("/admin/scenarios");
  }

  async function handleAddNode(event: React.FormEvent) {
    event.preventDefault();

    let content: Record<string, unknown>;
    let nextNodeMap: Record<string, string> = {};

    if (usesProductPicker(newNodeType)) {
      // マトリクスで追加した直後、まだ商品を選択していない空スロット("")は保存対象から除く
      const validProductIds =
        newNodeType === "product" ? newNodeProductIds.filter(Boolean) : newNodeProductIds;
      if (validProductIds.length === 0) {
        setToast({ message: "品番を1つ以上選択してください", type: "error" });
        return;
      }
      content =
        newNodeType === "product" ? { productIds: validProductIds } : { productId: validProductIds[0] };
      if (newNodeType === "product") {
        const prunedUpsell = Object.fromEntries(
          validProductIds
            .filter((id) => newNodeProductUpsell[id])
            .map((id) => [id, newNodeProductUpsell[id]])
            .filter(([, entry]) => (entry as ProductUpsellEntry).upsellProductId || (entry as ProductUpsellEntry).crossSellProductId),
        );
        if (Object.keys(prunedUpsell).length > 0) {
          content = { ...content, productUpsell: prunedUpsell };
        }
      }
      // 商品ノードは商品を選ぶと共通の決済フォームへ直接進むため、商品ごとの行き先は設定しない
      if (newNodeDefaultNext) {
        nextNodeMap = { default: newNodeDefaultNext };
      }
    } else if (newNodeType === "message") {
      if (!newNodeText.trim()) {
        setToast({ message: "メッセージ本文を入力してください", type: "error" });
        return;
      }
      content = {
        text: newNodeText.trim(),
        ...(newNodeImageUrl.trim() && { imageUrl: newNodeImageUrl.trim() }),
      };
      if (newNodeDefaultNext) nextNodeMap = { default: newNodeDefaultNext };
    } else if (newNodeType === "choice") {
      if (!newNodeChoiceText.trim()) {
        setToast({ message: "質問文を入力してください", type: "error" });
        return;
      }
      if (newNodeOptions.length === 0) {
        setToast({ message: "選択肢を1つ以上追加してください", type: "error" });
        return;
      }
      if (newNodeOptions.some((o) => !o.label.trim() || !o.value.trim())) {
        setToast({ message: "選択肢の表示ラベル・内部値を入力してください", type: "error" });
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
        setToast({ message: "画像URLを入力してください", type: "error" });
        return;
      }
      content = {
        imageUrls: urls,
        ...(newNodeImageLinkUrl.trim() && { linkUrl: newNodeImageLinkUrl.trim() }),
        ...(newNodeImageCaption.trim() && { caption: newNodeImageCaption.trim() }),
      };
      if (newNodeDefaultNext) nextNodeMap = { default: newNodeDefaultNext };
    } else if (newNodeType === "video") {
      if (!newNodeVideoUrl.trim()) {
        setToast({ message: "動画URLを入力してください", type: "error" });
        return;
      }
      content = {
        videoUrl: newNodeVideoUrl.trim(),
        aspectRatio: newNodeVideoAspectRatio,
        ...(newNodeVideoCaption.trim() && { caption: newNodeVideoCaption.trim() }),
      };
      if (newNodeDefaultNext) nextNodeMap = { default: newNodeDefaultNext };
    } else if (newNodeType === "coupon") {
      content = {};
      if (newNodeDefaultNext) nextNodeMap = { default: newNodeDefaultNext };
    } else {
      if (newNodeSurveyQuestions.length === 0) {
        setToast({ message: "質問を1つ以上追加してください", type: "error" });
        return;
      }
      if (newNodeSurveyQuestions.some((q) => !q.label.trim())) {
        setToast({ message: "質問文を入力してください", type: "error" });
        return;
      }
      if (
        newNodeSurveyQuestions.some(
          (q) =>
            (q.type === "checkbox" || q.type === "radio") &&
            (q.options ?? []).map((o) => o.trim()).filter(Boolean).length === 0,
        )
      ) {
        setToast({
          message: "チェックボックス・ラジオボタンの質問には選択肢を1つ以上入力してください",
          type: "error",
        });
        return;
      }
      content = {
        ...(newNodeSurveyIntro.trim() && { introText: newNodeSurveyIntro.trim() }),
        questions: serializeSurveyQuestions(newNodeSurveyQuestions),
      };
      if (newNodeDefaultNext) nextNodeMap = { default: newNodeDefaultNext };
    }

    // 商品を選ばずに決済フォームへ入る導線は成立しないため、決済導線ノードへの接続は作らせない
    if (newNodeType !== "product") {
      const checkoutNodeIds = new Set(nodes.filter((n) => n.type === "checkout").map((n) => n.id));
      const blocked = Object.values(nextNodeMap)
        .flatMap(resolveTargetNodeIds)
        .filter((id) => checkoutNodeIds.has(id))
        .map((id) => {
          const target = nodes.find((n) => n.id === id);
          return `「決済導線: ${truncate(target ? nodeSummary(target, products) : id, 40)}」`;
        });
      if (blocked.length > 0) {
        setErrorDialog({
          title: CHECKOUT_LINK_ERROR_TITLE,
          description: CHECKOUT_LINK_ERROR_DESCRIPTION,
          items: blocked,
        });
        return;
      }
    }

    const res = await fetch(`/api/scenarios/${scenario.id}/nodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: newNodeType,
        content,
        nextNodeMap,
        ...(newNodeMemo.trim() && { memo: newNodeMemo.trim() }),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `ノードの追加に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }

    if (newNodeIsEntry) {
      const { node: created } = await res.json();
      await fetch(`/api/scenarios/${scenario.id}/nodes/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isEntry: true }),
      });
    }

    setNewNodeProductIds([]);
    setNewNodeProductUpsell({});
    setNewNodeText("");
    setNewNodeImageUrl("");
    setNewNodeImageUrls([""]);
    setNewNodeImageLinkUrl("");
    setNewNodeImageCaption("");
    setNewNodeVideoUrl("");
    setNewNodeVideoAspectRatio(DEFAULT_VIDEO_ASPECT_RATIO);
    setNewNodeVideoCaption("");
    setNewNodeSurveyIntro("");
    setNewNodeSurveyQuestions([]);
    setNewNodeChoiceText("");
    setNewNodeOptions([]);
    setNewNodeDefaultNext("");
    setNewNodeIsEntry(false);
    setNewNodeMemo("");
    setToast({ message: "ノードを追加しました", type: "success" });
    router.refresh();
  }

  async function handleDeleteNode(nodeId: string) {
    const res = await fetch(`/api/scenarios/${scenario.id}/nodes/${nodeId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
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

    // 並び替え後に、いずれかのノードの次ノードリンクが自分と同じか、より手前の位置のノードを
    // 指してしまう(=チャットの流れが逆戻りする)場合は、紐付けが壊れるため並び替え自体を中止する
    const newIndexById = new Map(reordered.map((n, i) => [n.id, i]));
    const breaksLinkage = reordered.some((node, i) => {
      const effectiveNextNodeMap = patches.get(node.id)?.nextNodeMap ?? node.nextNodeMap;
      return Object.values(effectiveNextNodeMap).some((targetId) => {
        if (!targetId || targetId.startsWith(QA_TARGET_PREFIX)) return false;
        const targetIndex = newIndexById.get(targetId);
        return targetIndex !== undefined && targetIndex <= i;
      });
    });
    if (breaksLinkage) {
      setToast({
        message:
          "この並び替えを行うと、次のノードへの紐付けが手前のノードへ戻ってしまうため中止しました。先に紐付け先を変更してから並び替えてください。",
        type: "error",
      });
      return;
    }

    setReorderPending(moved.id);

    const results = await Promise.all(
      Array.from(patches.entries()).map(([nodeId, patch]) =>
        fetch(`/api/scenarios/${scenario.id}/nodes/${nodeId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        }),
      ),
    );
    setReorderPending(null);
    if (results.some((r) => !r.ok)) {
      setToast({ message: "並び替えに失敗しました", type: "error" });
    }
    router.refresh();
  }

  /**
   * gapIndexは、ドラッグ中のノードを除く前の並びにおける「隙間」の位置(0=先頭、nodes.length=末尾)。
   * ドラッグ元を取り除いた後の並びでの位置に変換してmoveNodeToPositionへ渡す(▲▼ボタンと同じ計算)。
   */
  function handleGapDrop(gapIndex: number) {
    if (draggingIndex === null) return;
    const fromIndex = draggingIndex;
    setDraggingIndex(null);
    setDragOverGap(null);
    const toPosition = gapIndex <= fromIndex ? gapIndex + 1 : gapIndex;
    moveNodeToPosition(fromIndex, toPosition);
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      {errorDialog && (
        <ErrorDialog
          title={errorDialog.title}
          description={errorDialog.description}
          items={errorDialog.items}
          onClose={() => setErrorDialog(null)}
        />
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        {editingScenarioName ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              autoFocus
              value={scenarioNameDraft}
              onChange={(e) => setScenarioNameDraft(e.target.value)}
              className="input max-w-xs"
            />
            <button
              type="button"
              onClick={handleRenameScenario}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingScenarioName(false);
                setScenarioNameDraft(scenario.name);
              }}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
            >
              キャンセル
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{scenario.name}</h1>
            <button
              type="button"
              onClick={() => {
                setScenarioNameDraft(scenario.name);
                setEditingScenarioName(true);
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              名前を編集
            </button>
            <ConfirmButton
              label="削除"
              confirmLabel="中のノードもすべて削除されます。よろしいですか？"
              className="text-sm text-red-600 hover:underline"
              onConfirm={handleDeleteScenario}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <a
            href={`/widget?scenarioId=${scenario.id}&preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            title="下書きでも確認できる、注文・決済・メール送信が一切発生しない安全なプレビュー"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            プレビュー
          </a>
          <a
            href={`/demo.html?scenarioId=${scenario.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="サイトに埋め込んだ想定のPC画面プレビューを開く"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            PCプレビュー
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

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
        {editingSlug ? (
          <>
            <input
              autoFocus
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value)}
              placeholder="半角英小文字・数字・ハイフンのみ(空欄で解除)"
              className="input max-w-xs"
            />
            <button
              type="button"
              onClick={handleEditSlug}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingSlug(false);
                setSlugDraft(scenario.slug ?? "");
              }}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
            >
              キャンセル
            </button>
          </>
        ) : (
          <>
            {scenario.slug ? (
              <>
                <span className="font-mono text-neutral-700">
                  {origin}/widget/{scenario.slug}
                </span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(`${origin}/widget/${scenario.slug}`)}
                  className="text-blue-600 hover:underline"
                >
                  コピー
                </button>
              </>
            ) : (
              <span>この商品・ブランド専用の公開URLは未設定です</span>
            )}
            <button
              type="button"
              onClick={() => {
                setSlugDraft(scenario.slug ?? "");
                setEditingSlug(true);
              }}
              className="text-blue-600 hover:underline"
            >
              {scenario.slug ? "URLを編集" : "専用URLを発行する"}
            </button>
          </>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
        {editingOrderCode ? (
          <>
            <input
              autoFocus
              value={orderCodeDraft}
              onChange={(e) => setOrderCodeDraft(e.target.value)}
              placeholder="半角英数字のみ(空欄でデフォルトのXXを使用)"
              className="input max-w-xs"
            />
            <button
              type="button"
              onClick={handleEditOrderCode}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingOrderCode(false);
                setOrderCodeDraft(scenario.orderCode ?? "");
              }}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
            >
              キャンセル
            </button>
          </>
        ) : (
          <>
            <span>
              注文番号の識別コード:{" "}
              <span className="font-mono text-neutral-700">{scenario.orderCode || "(未設定・XXを使用)"}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setOrderCodeDraft(scenario.orderCode ?? "");
                setEditingOrderCode(true);
              }}
              className="text-blue-600 hover:underline"
            >
              編集
            </button>
          </>
        )}
      </div>

      <Accordion title="シナリオ設定" defaultOpen>
      {products.length === 0 && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          商品が登録されていません。「商品提示」「決済導線」「商品QA」ノードで参照する場合は先に商品を登録してください。
        </p>
      )}

      <div className="mb-8">
        <DropGuide
          active={draggingIndex !== null && dragOverGap === 0}
          onDragOver={() => setDragOverGap(0)}
          onDrop={() => handleGapDrop(0)}
        />
        {nodes.map((node, index) => (
          <div key={node.id}>
            <div
              className={`flex items-start gap-2 ${draggingIndex === index ? "opacity-40" : ""}`}
            >
              <div className="flex shrink-0 flex-col items-center gap-1 pt-4">
                <div
                  draggable
                  onDragStart={() => setDraggingIndex(index)}
                  onDragEnd={() => {
                    setDraggingIndex(null);
                    setDragOverGap(null);
                  }}
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
                  className="input w-16 px-1 text-center"
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
                  isFirst={index === 0}
                  onMakeEntry={() => moveNodeToPosition(index, 1)}
                  products={products}
                  allNodes={nodes}
                  nodeOptions={nodeOptions.filter((n) => n.id !== node.id)}
                  onDelete={() => handleDeleteNode(node.id)}
                  showToast={setToast}
                  showErrorDialog={setErrorDialog}
                />
              </div>
            </div>
            <DropGuide
              active={draggingIndex !== null && dragOverGap === index + 1}
              onDragOver={() => setDragOverGap(index + 1)}
              onDrop={() => handleGapDrop(index + 1)}
            />
          </div>
        ))}
        {nodes.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
            ノードがまだありません
          </p>
        )}
      </div>

      <form
        onSubmit={handleAddNode}
        className={`space-y-4 border-t border-neutral-200 pt-6 ${
          newNodeType === "product" ? "max-w-4xl" : "max-w-xl"
        }`}
      >
        <h2 className="text-lg font-medium">ノードを追加</h2>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">ノード種別</span>
          <select
            className="input"
            value={newNodeType}
            onChange={(e) => setNewNodeType(e.target.value as ScenarioNodeType)}
          >
            {/* 決済導線ノードは廃止(商品提示ノードで商品を選ぶと決済フォームへ直接進む)。
                既存ノードの表示のためラベル自体は残すが、新規追加はできないようにする。 */}
            {(Object.keys(NODE_TYPE_LABELS) as ScenarioNodeType[])
              .filter((type) => type !== "checkout")
              .map((type) => (
                <option key={type} value={type}>
                  {NODE_TYPE_LABELS[type]}
                </option>
              ))}
          </select>
        </label>

        {newNodeType === "product_qa" && (
          <ProductGroupSelect
            label="アイテム(商品Q&Aはアイテム単位で登録されているため、品番ではなくアイテムを選択します)"
            products={products}
            value={newNodeProductIds[0] ?? ""}
            onChange={(id) => setNewNodeProductIds(id ? [id] : [])}
          />
        )}

        {newNodeType === "product" && (
          <ProductUpsellMatrixEditor
            productIds={newNodeProductIds}
            onProductIdsChange={setNewNodeProductIds}
            products={products}
            value={newNodeProductUpsell}
            onChange={setNewNodeProductUpsell}
          />
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
              <span className="mb-1 block font-medium text-neutral-700">画像URL(任意・比率自由・横幅いっぱいに表示)</span>
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

        {newNodeType === "video" && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                動画URL(直接URL(mp4等)、またはYouTube/Vimeoの動画URL)
              </span>
              <input
                className="input"
                placeholder="https://..."
                value={newNodeVideoUrl}
                onChange={(e) => setNewNodeVideoUrl(e.target.value)}
                onBlur={handleDetectNewNodeAspectRatio}
              />
              <p className="mt-1 text-xs text-neutral-500">
                縦横比:{" "}
                {newNodeVideoDetecting ? "検出中..." : newNodeVideoAspectRatio}
                {!newNodeVideoDetecting && newNodeVideoUrl.trim() && (
                  <button
                    type="button"
                    onClick={handleDetectNewNodeAspectRatio}
                    className="ml-2 text-blue-600 hover:underline"
                  >
                    再検出
                  </button>
                )}
              </p>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">キャプション(任意)</span>
              <input
                className="input"
                value={newNodeVideoCaption}
                onChange={(e) => setNewNodeVideoCaption(e.target.value)}
              />
            </label>
          </>
        )}

        {newNodeType === "survey" && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                アンケート冒頭のコメント(任意・例: よろしければアンケートにご協力ください)
              </span>
              <textarea
                className="input"
                rows={2}
                value={newNodeSurveyIntro}
                onChange={(e) => setNewNodeSurveyIntro(e.target.value)}
              />
            </label>
            <SurveyQuestionsEditor questions={newNodeSurveyQuestions} onChange={setNewNodeSurveyQuestions} />
          </>
        )}

        {newNodeType === "coupon" && (
          <p className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-600">
            {coupon
              ? `このシナリオの自動適用クーポン(${coupon.name})の告知画像・メッセージが、このノードの位置で表示されます。内容は「表示設定」内の「クーポン設定」から編集してください。`
              : "このシナリオにはまだ自動適用クーポンが設定されていません。「表示設定」内の「クーポン設定」から作成すると、このノードで告知が表示されるようになります。"}
          </p>
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
      </Accordion>

      <Accordion title="表示設定">
        <div className="flex flex-wrap gap-6">
          <div className="min-w-[260px] flex-1 space-y-5">
            <div>
              <span className="mb-2 block text-sm text-neutral-600">ヘッダー</span>
              <div className="mb-2 flex gap-4 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={display.headerMode === null}
                    onChange={() => setHeaderMode(null)}
                  />
                  未設定
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={display.headerMode === "image"}
                    onChange={() => setHeaderMode("image")}
                  />
                  画像
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={display.headerMode === "title"}
                    onChange={() => setHeaderMode("title")}
                  />
                  タイトル
                </label>
              </div>
              {display.headerMode === "image" && (
                <>
                  <input
                    className="input"
                    placeholder="https://..."
                    value={display.headerImageUrl}
                    onChange={(e) => setDisplay((prev) => ({ ...prev, headerImageUrl: e.target.value }))}
                    onBlur={commitHeaderImageUrl}
                  />
                  <p className="mt-1 text-xs text-neutral-400">
                    推奨比率: 横長(比率自由・横幅いっぱいに表示されます)
                  </p>
                </>
              )}
              {display.headerMode === "title" && (
                <div className="space-y-3">
                  <input
                    className="input"
                    placeholder="ヘッダーに表示するタイトル"
                    value={display.headerTitle}
                    onChange={(e) => setDisplay((prev) => ({ ...prev, headerTitle: e.target.value }))}
                    onBlur={commitHeaderTitle}
                  />
                  <ColorSwatchStrip
                    label="ヘッダーの背景色"
                    value={display.headerBackgroundColor}
                    onChange={(color) => setColorField("headerBackgroundColor", color)}
                    textColor={display.headerTextColor}
                    onTextColorChange={(color) => setTextColorField("headerTextColor", color)}
                  />
                </div>
              )}
            </div>

            <ColorSwatchStrip
              label="チャット画面全体の背景色"
              value={display.chatBackgroundColor}
              onChange={(color) => setColorField("chatBackgroundColor", color)}
              defaultColor={DEFAULT_CHAT_BACKGROUND_COLOR}
            />
            <ColorSwatchStrip
              label="メッセージの背景色(Bot側)"
              value={display.messageBackgroundColor}
              onChange={(color) => setColorField("messageBackgroundColor", color)}
              textColor={display.messageTextColor}
              onTextColorChange={(color) => setTextColorField("messageTextColor", color)}
              defaultColor={DEFAULT_MESSAGE_BACKGROUND_COLOR}
            />
            <ColorSwatchStrip
              label="メッセージの背景色(ユーザー側)"
              value={display.userMessageBackgroundColor}
              onChange={(color) => setColorField("userMessageBackgroundColor", color)}
              textColor={display.userMessageTextColor}
              onTextColorChange={(color) => setTextColorField("userMessageTextColor", color)}
              defaultColor={DEFAULT_USER_MESSAGE_BACKGROUND_COLOR}
            />
            <ColorSwatchStrip
              label="固定メニューの背景色"
              value={display.menuBackgroundColor}
              onChange={(color) => setColorField("menuBackgroundColor", color)}
              textColor={display.menuTextColor}
              onTextColorChange={(color) => setTextColorField("menuTextColor", color)}
            />
          </div>

          <DisplayPreview scenarioId={scenario.id} slug={scenario.slug} display={display} />
        </div>
      </Accordion>

      <Accordion title="固定メニュー設定">
        <p className="text-xs text-neutral-500">
          チャット画面下部に常時表示されるボタンです。特定のノードへジャンプさせるか、外部URLを新しいタブで開けます。
        </p>

        {menuItems.length === 0 ? (
          <p className="text-sm text-neutral-400">まだボタンが登録されていません</p>
        ) : (
          <div className="space-y-2">
            {menuItems.map((item, index) => (
              <div key={item.id} className="rounded-md border border-neutral-200 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="mr-3 flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={menuPending !== null || index === 0}
                      onClick={() => moveMenuItem(index, -1)}
                      className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={menuPending !== null || index === menuItems.length - 1}
                      onClick={() => moveMenuItem(index, 1)}
                      className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">{item.label}</span>
                    <span className="ml-2 text-xs text-neutral-500">
                      {item.actionType === "node"
                        ? `→ ${nodeOptions.find((n) => n.id === item.targetNodeId)?.summary ?? "(不明なノード)"}`
                        : item.actionType === "url"
                          ? `→ ${item.url}`
                          : item.actionType === "business_calendar"
                            ? "→ 営業日カレンダーを表示"
                            : "→ お買い物ガイドを表示"}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs">
                    {editingMenuItemId === item.id ? (
                      <button
                        type="button"
                        onClick={() => setEditingMenuItemId(null)}
                        className="text-neutral-600 hover:underline"
                      >
                        閉じる
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditingMenuItem(item)}
                        className="text-blue-600 hover:underline"
                      >
                        編集
                      </button>
                    )}
                    <ConfirmButton
                      label="削除"
                      disabled={menuPending === item.id}
                      onConfirm={() => handleDeleteMenuItem(item)}
                    />
                  </div>
                </div>

                {editingMenuItemId === item.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-500">ボタンのラベル</span>
                      <input
                        className="input"
                        value={editMenuLabel}
                        onChange={(e) => setEditMenuLabel(e.target.value)}
                        onBlur={() => commitEditMenuLabel(item.id)}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-500">動作</span>
                      <select
                        className="input"
                        value={editMenuActionType}
                        onChange={(e) =>
                          handleEditMenuActionTypeChange(item.id, e.target.value as MenuItemActionType)
                        }
                      >
                        <option value="node">ノードへ進む</option>
                        <option value="url">外部URLを開く</option>
                        <option value="business_calendar">営業日カレンダーを表示</option>
                        <option value="shopping_guide">お買い物ガイドを表示</option>
                      </select>
                    </label>
                    {editMenuActionType === "node" ? (
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-500">ジャンプ先ノード</span>
                        <select
                          className="input"
                          value={editMenuTargetNodeId}
                          onChange={(e) => commitEditMenuTargetNodeId(item.id, e.target.value)}
                        >
                          <option value="">選択してください</option>
                          {nodeOptions.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.summary}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : editMenuActionType === "url" ? (
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-500">URL</span>
                        <input
                          className="input"
                          value={editMenuUrl}
                          onChange={(e) => setEditMenuUrl(e.target.value)}
                          onBlur={() => commitEditMenuUrl(item.id)}
                          placeholder="https://..."
                        />
                      </label>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddMenuItem} className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">ボタンのラベル</span>
            <input
              className="input"
              value={newMenuLabel}
              onChange={(e) => setNewMenuLabel(e.target.value)}
              placeholder="例: 会社概要 / 今すぐ買う / 公式Instagram"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">動作</span>
            <select
              className="input"
              value={newMenuActionType}
              onChange={(e) => setNewMenuActionType(e.target.value as MenuItemActionType)}
            >
              <option value="node">ノードへ進む</option>
              <option value="url">外部URLを開く</option>
              <option value="business_calendar">営業日カレンダーを表示</option>
              <option value="shopping_guide">お買い物ガイドを表示</option>
            </select>
          </label>
          {newMenuActionType === "node" ? (
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">ジャンプ先ノード</span>
              <select
                className="input"
                value={newMenuTargetNodeId}
                onChange={(e) => setNewMenuTargetNodeId(e.target.value)}
              >
                <option value="">選択してください</option>
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.summary}
                  </option>
                ))}
              </select>
            </label>
          ) : newMenuActionType === "url" ? (
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">URL</span>
              <input
                className="input"
                value={newMenuUrl}
                onChange={(e) => setNewMenuUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>
          ) : null}
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            追加
          </button>
        </form>
      </Accordion>

      <Accordion title="ポップアップ設定">
        <p className="text-xs text-neutral-500">
          埋め込みタグの「ポップアップ表示」で表示されるボタンの見た目です。アイコン画像を設定すると、
          デフォルトのテキストボタンの代わりに丸いアイコンボタンで表示されます。
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-neutral-500">
            アイコン画像URL(未設定でテキストボタン・正方形1:1推奨・60×60pxの円形で表示されます)
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              value={popupIconUrlDraft}
              onChange={(e) => setPopupIconUrlDraft(e.target.value)}
              placeholder="https://..."
              className="input flex-1"
            />
            <button
              type="button"
              onClick={handleSavePopupIconUrl}
              disabled={popupIconUrlSaving}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {popupIconUrlSaving ? "保存中..." : popupIconUrlSaved ? "保存済み" : "保存"}
            </button>
          </div>
        </label>
        <div>
          <span className="mb-2 block text-sm text-neutral-600">表示位置</span>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={popupPosition === "bottom-right"}
                onChange={() => setPopupPosition("bottom-right")}
              />
              右下
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={popupPosition === "bottom-left"}
                onChange={() => setPopupPosition("bottom-left")}
              />
              左下
            </label>
          </div>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold text-neutral-600">
            LP内の画像等をクリックしてポップアップを開く(フローティングボタンと併用)
          </h4>
          <p className="mb-2 text-xs text-neutral-500">
            埋め込みタグの「ポップアップ表示」を設置したページ内であれば、下記のコードをLP内の好きな場所に
            そのまま貼り付けるだけで、フローティングボタンに加えてその画像クリックでもポップアップが開くようになります。
          </p>
          <EmbedSnippet
            label="LP内画像の例"
            code={`<img src="${popupIconUrlDraft.trim() || "アイコン画像URL"}" data-pm-chatbot-open style="cursor:pointer" alt="チャットで相談する" />`}
          />
        </div>
      </Accordion>

      <Accordion title="クーポン設定">
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={couponCodeFieldEnabled}
              onChange={(e) => setCouponCodeFieldEnabled(e.target.checked)}
            />
            決済確認画面にクーポンコード入力欄を表示する
          </label>
          <p className="mt-1 text-xs text-neutral-500">
            お客様が手入力するクーポンコード(インフルエンサー計測用等)の入力欄です。コード自体は
            「クーポン」管理画面で発行します。このシナリオで下記の自動適用クーポンを使う場合は、
            通常オフにしてください。
          </p>
        </div>

        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700">その場で配布する自動適用クーポン</h3>
          <p className="mb-3 text-xs text-neutral-500">
            このシナリオを経由した決済に、コード入力なしで自動的に適用されます。広告限定の特別価格などに。
            シナリオにつき1件のみ設定できます。
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">名称(管理用)</span>
              <input
                className="input"
                value={couponForm.name}
                onChange={(e) => setCouponForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="例: 夏セール10%オフ"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">割引種別</span>
              <select
                className="input"
                value={couponForm.discountType}
                onChange={(e) =>
                  setCouponForm((p) => ({ ...p, discountType: e.target.value as "percent" | "fixed" }))
                }
              >
                <option value="percent">%引き</option>
                <option value="fixed">定額引き</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">
                割引額({couponForm.discountType === "percent" ? "%" : "円"})
              </span>
              <input
                type="number"
                min={1}
                className="input"
                value={couponForm.discountValue}
                onChange={(e) => setCouponForm((p) => ({ ...p, discountValue: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">開始日(任意)</span>
              <input
                type="date"
                className="input"
                value={couponForm.startsAt}
                onChange={(e) => setCouponForm((p) => ({ ...p, startsAt: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">終了日(任意)</span>
              <input
                type="date"
                className="input"
                value={couponForm.endsAt}
                onChange={(e) => setCouponForm((p) => ({ ...p, endsAt: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">上限枚数(任意)</span>
              <input
                type="number"
                min={1}
                className="input"
                value={couponForm.maxUses}
                onChange={(e) => setCouponForm((p) => ({ ...p, maxUses: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">最低注文金額(任意・円)</span>
              <input
                type="number"
                min={0}
                className="input"
                value={couponForm.minOrderAmount}
                onChange={(e) => setCouponForm((p) => ({ ...p, minOrderAmount: e.target.value }))}
              />
            </label>
          </div>
          <div className="mt-3">
            <h4 className="mb-1 text-xs font-semibold text-neutral-600">クーポン表示ノード用の告知内容(任意)</h4>
            <p className="mb-2 text-xs text-neutral-500">
              チャットフローに「クーポン表示」ノードを配置すると、ここで設定した画像・メッセージが
              「お得なクーポンがあります」のように表示されます。推奨比率: 正方形(1:1)または4:3横長。
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="block grow text-sm">
                <span className="mb-1 block text-xs text-neutral-500">告知画像URL</span>
                <input
                  className="input w-full"
                  value={couponForm.imageUrl}
                  onChange={(e) => setCouponForm((p) => ({ ...p, imageUrl: e.target.value }))}
                  placeholder="https://example.com/coupon.jpg"
                />
              </label>
              <label className="block grow text-sm">
                <span className="mb-1 block text-xs text-neutral-500">訴求メッセージ</span>
                <input
                  className="input w-full"
                  value={couponForm.promoMessage}
                  onChange={(e) => setCouponForm((p) => ({ ...p, promoMessage: e.target.value }))}
                  placeholder="お得なクーポンがあります"
                />
              </label>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveCoupon}
              disabled={couponSaving}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {couponSaving ? "保存中..." : couponSaved ? "保存済み" : coupon ? "更新する" : "作成する"}
            </button>
            {coupon && (
              <>
                <button
                  type="button"
                  onClick={handleToggleCouponActive}
                  disabled={couponSaving}
                  className={`rounded-full px-3 py-1 text-xs ${
                    coupon.isActive ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {coupon.isActive ? "有効" : "無効"}
                </button>
                <span className="text-xs text-neutral-500">
                  使用数: {coupon.usedCount}
                  {coupon.maxUses !== null ? ` / ${coupon.maxUses}` : ""}
                </span>
                <ConfirmButton
                  label="削除"
                  confirmLabel="このシナリオの自動適用クーポンを削除しますか？"
                  disabled={couponSaving}
                  onConfirm={handleDeleteCoupon}
                />
              </>
            )}
          </div>
        </div>
      </Accordion>

      <Accordion title="タグ設定">
        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700">埋め込みタグ</h3>
          <p className="mb-3 text-xs text-neutral-500">
            このシナリオを外部サイトに設置するためのコードです。専用URLの発行が必要です。
          </p>
          {scenario.slug ? (
            <div className="space-y-4">
              <div>
                <EmbedSnippet
                  label="ポップアップ表示(サイトの隅にボタンを追加)"
                  code={`<script src="${origin}/widget.js" data-widget-origin="${origin}" data-scenario="${scenario.slug}"></script>`}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  設置場所: ページ内のどこに置いても動作しますが、表示速度への影響を避けるため
                  <code className="mx-1 rounded bg-neutral-100 px-1">{"</body>"}</code>
                  タグの直前(本文の一番最後)への設置を推奨します。全ページ共通のフッター・テンプレートに1回入れておけば、
                  そのページすべてに反映されます。
                </p>
              </div>
              <div>
                <EmbedSnippet
                  label="直接埋め込み(ページ全体・LPに設置)"
                  code={`<iframe id="pmchat-${scenario.slug}" src="${origin}/widget/${scenario.slug}" style="width:100%;height:100%;border:none" allow="payment"></iframe>
<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var utm = new URLSearchParams();
  var hasUtm = false;
  ["utm_source", "utm_medium", "utm_campaign"].forEach(function (key) {
    var value = params.get(key);
    if (value) {
      utm.set(key, value);
      hasUtm = true;
    }
  });
  if (hasUtm) {
    var iframe = document.getElementById("pmchat-${scenario.slug}");
    iframe.src += (iframe.src.indexOf("?") > -1 ? "&" : "?") + utm.toString();
  }

  // 購入完了時のコンバージョンタグ。iframe内ではなくこのページの文脈で実行する必要があるため、
  // チャットウィジェットからのpostMessageを受けてここで実行する。
  var conversionTag = null;
  fetch("${origin}/api/widget/scenario?slug=${scenario.slug}")
    .then(function (res) { return res.ok ? res.json() : {}; })
    .then(function (body) { conversionTag = (body && body.scenario && body.scenario.conversion_tag) || null; })
    .catch(function () {});

  // 個別のコンバージョンタグが未設定の場合、このページに元々設置されている広告計測基盤
  // (Google Tag Manager / gtag.js / Metaピクセル)へ、標準の購入イベントを自動で送信する。
  function fireAutoFallback(amount, orderId) {
    if (window.dataLayer && typeof window.dataLayer.push === "function") {
      window.dataLayer.push({ event: "purchase", ecommerce: { transaction_id: orderId, value: amount, currency: "JPY" } });
    }
    if (typeof window.gtag === "function") {
      window.gtag("event", "purchase", { transaction_id: orderId, value: amount, currency: "JPY" });
    }
    if (typeof window.fbq === "function") {
      window.fbq("track", "Purchase", { value: amount, currency: "JPY" });
    }
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== "${origin}") return;
    var data = event.data;
    if (!data || data.source !== "pm-chatbot" || data.type !== "conversion") return;
    if (!conversionTag) {
      fireAutoFallback(data.amount, data.orderId);
      return;
    }
    var filled = conversionTag
      .split("{{amount}}").join(String(data.amount))
      .split("{{orderId}}").join(String(data.orderId));
    var container = document.createElement("div");
    container.innerHTML = filled;
    Array.prototype.slice.call(container.childNodes).forEach(function (node) {
      if (node.nodeType === 1 && node.tagName === "SCRIPT") {
        var script = document.createElement("script");
        Array.prototype.slice.call(node.attributes).forEach(function (attr) {
          script.setAttribute(attr.name, attr.value);
        });
        script.textContent = node.textContent;
        document.body.appendChild(script);
      } else {
        document.body.appendChild(node);
      }
    });
  });
})();
</script>`}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  設置場所: チャットを表示したい位置(LP本文内の、実際にチャット画面を見せたい場所)に、
                  そのまま貼り付けてください。ポップアップとは異なり、貼り付けた場所にチャット画面自体が表示されます。
                </p>
              </div>
              <p className="text-xs text-neutral-500">
                広告(Google広告・Meta広告等)のリンク先URLにutm_source・utm_medium・utm_campaignを付与しておくと、
                上記のタグが自動でチャットボット側に引き継ぎ、実績ダッシュボードで広告別に集計できます。
                LPを複数持つ場合は、LPごとにutm_campaign(またはutm_content)を分けて発行してください。
              </p>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              埋め込みタグを発行するには、上の「専用URLを発行する」からこのシナリオの公開URLを設定してください。
            </p>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700">自動メールの送信元アドレス</h3>
          <p className="mb-3 text-xs text-neutral-500">
            注文完了・定期便・離脱リマインドの自動メールを送る際の送信元アドレスです。未設定の場合は共通のアドレスを使います。
            複数ブランドで使い分ける場合はブランドごとにここで設定してください。
            送信元に使うドメインは、事前にResend側でSPF/DKIM等のドメイン認証が完了している必要があります。
          </p>
          <input
            type="text"
            value={emailFromAddressDraft}
            onChange={(e) => setEmailFromAddressDraft(e.target.value)}
            placeholder="ブランドA 注文受付 <order@brand-a.example.com>"
            className="input mb-2 w-full"
          />
          <button
            type="button"
            onClick={handleSaveEmailFromAddress}
            disabled={emailFromAddressSaving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {emailFromAddressSaving ? "保存中..." : emailFromAddressSaved ? "保存済み" : "保存"}
          </button>
        </div>

        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700">広告計測タグ</h3>
          <p className="mb-3 text-xs text-neutral-500">
            GA4・Google広告・Metaピクセル等、このシナリオのチャット画面に埋め込みたいHTML/JSタグを貼り付けてください。
            ウィジェットはiframeで表示されるため、タグはそのiframe内で実行されます。
          </p>
          <textarea
            value={adTagDraft}
            onChange={(e) => setAdTagDraft(e.target.value)}
            rows={6}
            placeholder="<script>...</script>"
            className="mb-2 w-full rounded-md border border-neutral-300 p-2 font-mono text-xs"
          />
          <button
            type="button"
            onClick={handleSaveAdTag}
            disabled={adTagSaving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {adTagSaving ? "保存中..." : adTagSaved ? "保存済み" : "保存"}
          </button>
        </div>

        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700">購入完了計測タグ(コンバージョンタグ)</h3>
          <p className="mb-3 text-xs text-neutral-500">
            Google広告のコンバージョンタグ、Metaの購入イベント等、注文完了の瞬間にのみ発火させたいタグを貼り付けてください。
            上の「広告計測タグ」はチャット表示のたびに発火しますが、こちらは注文完了時に1回だけ発火します。
            タグ内で <code className="rounded bg-neutral-100 px-1">{"{{amount}}"}</code> と書くと注文金額に、
            <code className="rounded bg-neutral-100 px-1">{"{{orderId}}"}</code> と書くと注文IDに置き換わります
            (例: <code className="rounded bg-neutral-100 px-1">value: {"{{amount}}"}, transaction_id: &apos;{"{{orderId}}"}&apos;</code>)。
            埋め込み先ページ側で正しく計測するため、タグは埋め込み元ページ(ポップアップの場合)側で実行されます。
          </p>
          <textarea
            value={conversionTagDraft}
            onChange={(e) => setConversionTagDraft(e.target.value)}
            rows={6}
            placeholder="<script>gtag('event', 'conversion', { send_to: 'AW-XXXXXXX/YYYYYYY', value: {{amount}}, currency: 'JPY', transaction_id: '{{orderId}}' });</script>"
            className="mb-2 w-full rounded-md border border-neutral-300 p-2 font-mono text-xs"
          />
          <button
            type="button"
            onClick={handleSaveConversionTag}
            disabled={conversionTagSaving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {conversionTagSaving ? "保存中..." : conversionTagSaved ? "保存済み" : "保存"}
          </button>
        </div>
      </Accordion>
    </div>
  );
}

function NodeCard({
  scenarioId,
  node,
  products,
  allNodes,
  nodeOptions,
  isFirst,
  onMakeEntry,
  onDelete,
  showToast,
  showErrorDialog,
}: {
  scenarioId: string;
  node: ScenarioNode;
  products: PickableProduct[];
  allNodes: ScenarioNode[];
  nodeOptions: { id: string; summary: string }[];
  isFirst: boolean;
  onMakeEntry: () => void;
  onDelete: () => void;
  showToast: (toast: { message: string; type: "success" | "error" }) => void;
  showErrorDialog: (dialog: { title: string; description?: string; items?: string[] }) => void;
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
  // 旧仕様(決済導線ノード側に設定)のアップセル・クロスセルもマトリクスに引き継いで表示する。
  // 保存すれば商品提示ノードの content.productUpsell に取り込まれ、決済導線ノードは不要になる。
  const [initialProductUpsellMap] = useState<Record<string, ProductUpsellEntry>>(() =>
    inheritUpsellFromCheckoutNodes(node, allNodes),
  );
  const [productUpsellMap, setProductUpsellMap] = useState<Record<string, ProductUpsellEntry>>(
    initialProductUpsellMap,
  );
  const inheritedUpsellCount =
    Object.keys(initialProductUpsellMap).length -
    Object.keys((node.content.productUpsell as Record<string, ProductUpsellEntry> | undefined) ?? {}).length;
  const [text, setText] = useState((node.content.text as string) ?? "");
  const [imageUrl, setImageUrl] = useState((node.content.imageUrl as string) ?? "");
  const [imageUrls, setImageUrls] = useState<string[]>(
    (node.content.imageUrls as string[] | undefined) ??
      (node.content.imageUrl ? [node.content.imageUrl as string] : [""]),
  );
  const [imageLinkUrl, setImageLinkUrl] = useState((node.content.linkUrl as string) ?? "");
  const [imageCaption, setImageCaption] = useState((node.content.caption as string) ?? "");
  const [videoUrl, setVideoUrl] = useState((node.content.videoUrl as string) ?? "");
  const [videoAspectRatio, setVideoAspectRatio] = useState(
    (node.content.aspectRatio as string) ?? DEFAULT_VIDEO_ASPECT_RATIO,
  );
  const [videoDetecting, setVideoDetecting] = useState(false);
  const [videoCaption, setVideoCaption] = useState((node.content.caption as string) ?? "");

  async function handleDetectVideoAspectRatio() {
    if (!videoUrl.trim()) return;
    setVideoDetecting(true);
    try {
      setVideoAspectRatio(await detectAspectRatio(videoUrl.trim()));
    } catch {
      setVideoAspectRatio(DEFAULT_VIDEO_ASPECT_RATIO);
    } finally {
      setVideoDetecting(false);
    }
  }
  const [surveyIntro, setSurveyIntro] = useState((node.content.introText as string) ?? "");
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
    setProductUpsellMap((node.content.productUpsell as Record<string, ProductUpsellEntry> | undefined) ?? {});
    setText((node.content.text as string) ?? "");
    setImageUrl((node.content.imageUrl as string) ?? "");
    setImageUrls(
      (node.content.imageUrls as string[] | undefined) ??
        (node.content.imageUrl ? [node.content.imageUrl as string] : [""]),
    );
    setImageLinkUrl((node.content.linkUrl as string) ?? "");
    setImageCaption((node.content.caption as string) ?? "");
    setVideoUrl((node.content.videoUrl as string) ?? "");
    setVideoAspectRatio((node.content.aspectRatio as string) ?? DEFAULT_VIDEO_ASPECT_RATIO);
    setVideoCaption((node.content.caption as string) ?? "");
    setSurveyIntro((node.content.introText as string) ?? "");
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
    setEditing(true);
  }

  async function handleSave() {
    let content: Record<string, unknown>;
    let nextNodeMap: Record<string, string> = {};

    if (usesProductPicker(node.type)) {
      // マトリクスで追加した直後、まだ商品を選択していない空スロット("")は保存対象から除く
      const validProductIds = node.type === "product" ? productIds.filter(Boolean) : productIds;
      if (validProductIds.length === 0) {
        showToast({ message: "品番を1つ以上選択してください", type: "error" });
        return;
      }
      content = node.type === "product" ? { productIds: validProductIds } : { productId: validProductIds[0] };
      if (node.type === "product") {
        const prunedUpsell = Object.fromEntries(
          validProductIds
            .filter((id) => productUpsellMap[id])
            .map((id) => [id, productUpsellMap[id]])
            .filter(([, entry]) => (entry as ProductUpsellEntry).upsellProductId || (entry as ProductUpsellEntry).crossSellProductId),
        );
        if (Object.keys(prunedUpsell).length > 0) {
          content = { ...content, productUpsell: prunedUpsell };
        }
      }
      if (node.type === "checkout") {
        const mainProduct = products.find((p) => p.id === productIds[0]);
        const crossSellProduct = products.find((p) => p.id === crossSellProductId);
        if (
          crossSellProduct?.orderType === "subscription" &&
          mainProduct?.orderType !== "subscription"
        ) {
          showToast({
            message: "対象商品が単品のため、定期対応品はクロスセルに設定できません",
            type: "error",
          });
          return;
        }
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
        // アップセル・クロスセルはこのマトリクスが唯一の設定箇所になったため、
        // 旧仕様の決済導線ノードへの紐付けは保存時に解除する
        // (商品を選ぶと共通の決済フォームへ直接進むので、決済導線ノードの指定は不要)。
        const checkoutNodeIds = new Set(allNodes.filter((n) => n.type === "checkout").map((n) => n.id));
        nextNodeMap = {};
        for (const id of validProductIds) {
          const next = productNextMap[id];
          if (next && !checkoutNodeIds.has(next)) nextNodeMap[id] = next;
        }
        if (defaultNext && !checkoutNodeIds.has(defaultNext)) nextNodeMap.default = defaultNext;
      } else if (defaultNext) {
        nextNodeMap = { default: defaultNext };
      }
    } else if (node.type === "message") {
      if (!text.trim()) {
        showToast({ message: "メッセージ本文を入力してください", type: "error" });
        return;
      }
      content = { text: text.trim(), ...(imageUrl.trim() && { imageUrl: imageUrl.trim() }) };
      if (defaultNext) nextNodeMap = { default: defaultNext };
    } else if (node.type === "choice") {
      if (!text.trim()) {
        showToast({ message: "質問文を入力してください", type: "error" });
        return;
      }
      if (options.length === 0) {
        showToast({ message: "選択肢を1つ以上追加してください", type: "error" });
        return;
      }
      if (options.some((o) => !o.label.trim() || !o.value.trim())) {
        showToast({ message: "選択肢の表示ラベル・内部値を入力してください", type: "error" });
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
        showToast({ message: "画像URLを入力してください", type: "error" });
        return;
      }
      content = {
        imageUrls: urls,
        ...(imageLinkUrl.trim() && { linkUrl: imageLinkUrl.trim() }),
        ...(imageCaption.trim() && { caption: imageCaption.trim() }),
      };
      if (defaultNext) nextNodeMap = { default: defaultNext };
    } else if (node.type === "video") {
      if (!videoUrl.trim()) {
        showToast({ message: "動画URLを入力してください", type: "error" });
        return;
      }
      content = {
        videoUrl: videoUrl.trim(),
        aspectRatio: videoAspectRatio,
        ...(videoCaption.trim() && { caption: videoCaption.trim() }),
      };
      if (defaultNext) nextNodeMap = { default: defaultNext };
    } else if (node.type === "coupon") {
      content = {};
      if (defaultNext) nextNodeMap = { default: defaultNext };
    } else {
      if (surveyQuestions.length === 0) {
        showToast({ message: "質問を1つ以上追加してください", type: "error" });
        return;
      }
      if (surveyQuestions.some((q) => !q.label.trim())) {
        showToast({ message: "質問文を入力してください", type: "error" });
        return;
      }
      if (
        surveyQuestions.some(
          (q) =>
            (q.type === "checkbox" || q.type === "radio") &&
            (q.options ?? []).map((o) => o.trim()).filter(Boolean).length === 0,
        )
      ) {
        showToast({
          message: "チェックボックス・ラジオボタンの質問には選択肢を1つ以上入力してください",
          type: "error",
        });
        return;
      }
      content = {
        ...(surveyIntro.trim() && { introText: surveyIntro.trim() }),
        questions: serializeSurveyQuestions(surveyQuestions),
      };
      if (defaultNext) nextNodeMap = { default: defaultNext };
    }

    // 商品を選ばずに決済フォームへ入る導線は成立しないため、決済導線ノードへの接続は保存させない
    if (node.type !== "product" && node.type !== "checkout") {
      const checkoutNodeIds = new Set(allNodes.filter((n) => n.type === "checkout").map((n) => n.id));
      const blocked = Object.values(nextNodeMap)
        .flatMap(resolveTargetNodeIds)
        .filter((id) => checkoutNodeIds.has(id))
        .map((id) => {
          const target = allNodes.find((n) => n.id === id);
          return `「決済導線: ${truncate(target ? nodeSummary(target, products) : id, 40)}」`;
        });
      if (blocked.length > 0) {
        showErrorDialog({
          title: CHECKOUT_LINK_ERROR_TITLE,
          description: CHECKOUT_LINK_ERROR_DESCRIPTION,
          items: blocked,
        });
        return;
      }
    }

    setSaving(true);
    const res = await fetch(`/api/scenarios/${scenarioId}/nodes/${node.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, nextNodeMap, memo: memo.trim() }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast({
        message: `更新に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setEditing(false);
    showToast({ message: "保存しました", type: "success" });
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
          {NODE_TYPE_LABELS[node.type]}
          {isFirst && " ・開始ノード"}
        </span>
        <div className="flex gap-3 text-xs">
          {!editing && (
            <button type="button" onClick={startEditing} className="text-blue-600 hover:underline">
              編集
            </button>
          )}
          <ConfirmButton label="削除" onConfirm={onDelete} />
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <label className="block text-xs">
            <span className="mb-1 block text-neutral-500">
              メモ(任意・管理用。チャットボット画面には表示されません)
            </span>
            <textarea className="input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>

          {node.type === "product_qa" && (
            <ProductGroupSelect
              label="アイテム(商品Q&Aはアイテム単位で登録されているため、品番ではなくアイテムを選択します)"
              products={products}
              value={productIds[0] ?? ""}
              onChange={(id) => setProductIds(id ? [id] : [])}
              compact
            />
          )}

          {node.type === "checkout" && (
            <label className="block text-xs">
              <span className="mb-1 block text-neutral-500">品番(1件選択)</span>
              <ProductPicker
                type={node.type}
                products={products}
                selectedIds={productIds}
                onChange={setProductIds}
              />
            </label>
          )}

          {node.type === "product" && (
            <ProductUpsellMatrixEditor
              productIds={productIds}
              onProductIdsChange={setProductIds}
              products={products}
              value={productUpsellMap}
              onChange={setProductUpsellMap}
              inheritedCount={inheritedUpsellCount}
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
                <span className="mb-1 block text-neutral-500">アップセル画像URL(任意・正方形1:1推奨)</span>
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
                products={crossSellCandidates(products, productIds[0])}
                value={crossSellProductId}
                onChange={setCrossSellProductId}
                compact
              />
              {(() => {
                const mainProduct = products.find((p) => p.id === productIds[0]);
                return mainProduct && mainProduct.orderType !== "subscription" ? (
                  <p className="text-xs text-neutral-400">
                    対象商品が単品のため、定期対応品はクロスセルに選べません(2回目以降の注文を作成できないため)。
                  </p>
                ) : null;
              })()}
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">クロスセル画像URL(任意・正方形1:1推奨)</span>
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
                <span className="mb-1 block text-neutral-500">画像URL(任意・比率自由・横幅いっぱいに表示)</span>
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

          {node.type === "video" && (
            <>
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">
                  動画URL(直接URL(mp4等)、またはYouTube/Vimeoの動画URL)
                </span>
                <input
                  className="input"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onBlur={handleDetectVideoAspectRatio}
                />
                <p className="mt-1 text-neutral-500">
                  縦横比: {videoDetecting ? "検出中..." : videoAspectRatio}
                  {!videoDetecting && videoUrl.trim() && (
                    <button
                      type="button"
                      onClick={handleDetectVideoAspectRatio}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      再検出
                    </button>
                  )}
                </p>
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">キャプション(任意)</span>
                <input
                  className="input"
                  value={videoCaption}
                  onChange={(e) => setVideoCaption(e.target.value)}
                />
              </label>
            </>
          )}

          {node.type === "survey" && (
            <>
              <label className="block text-xs">
                <span className="mb-1 block text-neutral-500">
                  アンケート冒頭のコメント(任意・例: よろしければアンケートにご協力ください)
                </span>
                <textarea
                  className="input"
                  rows={2}
                  value={surveyIntro}
                  onChange={(e) => setSurveyIntro(e.target.value)}
                />
              </label>
              <SurveyQuestionsEditor questions={surveyQuestions} onChange={setSurveyQuestions} compact />
            </>
          )}

          {node.type === "coupon" && (
            <p className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-600">
              このシナリオの自動適用クーポンの告知画像・メッセージが、このノードの位置で表示されます。
              内容は「表示設定」内の「クーポン設定」から編集してください。
            </p>
          )}

          <NextNodeSelect
            label={node.type === "choice" ? "どの選択肢にも一致しない場合に進むノード(任意)" : "次に進むノード"}
            // 商品提示ノードは商品を選ぶと決済フォームへ直接進むため、決済導線ノードは選ばせない
            nodeOptions={
              node.type === "product"
                ? nodeOptions.filter((n) => allNodes.find((x) => x.id === n.id)?.type !== "checkout")
                : nodeOptions
            }
            value={defaultNext}
            onChange={setDefaultNext}
            compact
          />

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isFirst}
              disabled={isFirst}
              onChange={(e) => {
                if (e.target.checked) onMakeEntry();
              }}
            />
            このノードを開始ノードにする(表示順が1番目になります)
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
          {node.type === "checkout" && (
            <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">
              決済導線ノードは廃止されました。商品提示ノードで商品を選ぶと決済フォームへ直接進むため、このノードは不要です。
              このノードを「削除」すると、設定されているアップセル・クロスセルは対象品番を含む商品提示ノードへ自動で移されます。
              移行後の内容は商品提示ノードの編集画面で確認・修正できます。
            </p>
          )}
          {node.type === "product" ? (
            <div className="rounded bg-neutral-50 p-2 text-xs">
              {productIds.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {productIds.map((id) => {
                    const product = products.find((p) => p.id === id);
                    // 決済導線ノードへの旧紐付けが残っていても、実際の挙動と揃えて
                    //「決済フォームへ進む」と表示する(保存時に紐付けは解除される)
                    const isCheckout = (nodeId: string) =>
                      allNodes.find((n) => n.id === nodeId)?.type === "checkout";
                    const targetId = productNextMap[id] || defaultNext;
                    const target =
                      targetId && !isCheckout(targetId)
                        ? nodeOptions.find((n) => n.id === targetId)
                        : undefined;
                    const upsell = productUpsellMap[id];
                    const upsellName = upsell?.upsellProductId
                      ? products.find((p) => p.id === upsell.upsellProductId)?.name
                      : undefined;
                    const crossSellName = upsell?.crossSellProductId
                      ? products.find((p) => p.id === upsell.crossSellProductId)?.name
                      : undefined;
                    return (
                      <li key={id}>
                        {product ? productLabel(product) : "未設定"} →{" "}
                        {target?.summary ?? "決済フォームへ進む"}
                        {(upsellName || crossSellName) && (
                          <span className="text-neutral-400">
                            {" "}
                            ({[upsellName && `アップセル: ${upsellName}`, crossSellName && `クロスセル: ${crossSellName}`]
                              .filter(Boolean)
                              .join(" / ")})
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                "未設定"
              )}
            </div>
          ) : usesProductPicker(node.type) ? (
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
          ) : node.type === "video" ? (
            <div className="rounded bg-neutral-50 p-2 text-xs">
              {videoUrl ? (
                <div className="flex items-start gap-2">
                  {getVideoThumbnailUrl(videoUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getVideoThumbnailUrl(videoUrl)!}
                      alt=""
                      className="h-16 w-28 shrink-0 rounded border border-neutral-200 object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded border border-neutral-200 bg-neutral-100 text-neutral-400">
                      ▶
                    </span>
                  )}
                  <p className="break-all text-neutral-600">
                    {videoUrl} ({videoAspectRatio})
                  </p>
                </div>
              ) : (
                "(未設定)"
              )}
              {videoCaption && <p className="mt-1 text-neutral-500">{videoCaption}</p>}
            </div>
          ) : node.type === "survey" ? (
            <div className="rounded bg-neutral-50 p-2 text-xs">
              {surveyIntro && <p className="mb-1 text-neutral-600">{surveyIntro}</p>}
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
          ) : node.type === "coupon" ? (
            <p className="rounded bg-neutral-50 p-2 text-xs text-neutral-500">
              このシナリオの自動適用クーポンの告知画像・メッセージを表示します
            </p>
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
          {node.type !== "product" && (
            <p className="mt-1 rounded bg-neutral-50 p-2 text-xs text-neutral-500">
              次のノード:{" "}
              {node.type === "choice"
                ? options
                    .map((o) => {
                      if (o.qaProductId) {
                        const groupName =
                          products.find((p) => p.id === o.qaProductId)?.productGroupName ?? "未設定";
                        const after = nodeOptions.find((n) => n.id === o.nextNodeId);
                        return `${o.label || o.value}→Q&A表示(${groupName})→${after?.summary ?? "自動: 一覧の次のノードへ進む"}`;
                      }
                      const target = nodeOptions.find((n) => n.id === o.nextNodeId);
                      return target ? `${o.label || o.value}→${target.summary}` : null;
                    })
                    .filter(Boolean)
                    .join("、") ||
                  (nodeOptions.find((n) => n.id === defaultNext)?.summary ?? "自動: 一覧の次のノードへ進む")
                : (nodeOptions.find((n) => n.id === defaultNext)?.summary ?? "自動: 一覧の次のノードへ進む")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
