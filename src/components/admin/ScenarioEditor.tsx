"use client";

import { useEffect, useId, useRef, useState } from "react";
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
import { SaveConfirmDialog } from "@/components/admin/SaveConfirmDialog";
import { ScenarioCheckoutFieldsSection } from "@/components/admin/ScenarioCheckoutFieldsSection";
import type { CheckoutFieldKey } from "@/lib/checkout-fields";
import { markEditingStart, markEditingEnd, registerSaveHandler } from "@/lib/unsaved-changes";
import {
  MENU_LAYOUTS,
  getMenuLayout,
  menuCellGridColumn,
  menuCellGridRow,
  menuGridTemplateColumns,
  menuGridTemplateRows,
  type MenuLayoutDef,
} from "@/lib/menu-layouts";

type ToastState = { message: string; type: "success" | "error" } | null;
type ErrorDialogState = { title: string; description?: string; items?: string[] } | null;

const SURVEY_ANSWER_TYPE_LABELS: Record<SurveyAnswerType, string> = {
  checkbox: "チェックボックス(複数選択)",
  radio: "ラジオボタン(単一選択)",
  date: "生年月日",
  text_short: "フリーコメント(短文)",
  text_long: "フリーコメント(長文)",
};

/** 生年月日は決済フォーム側で収集するため、新規設問の選択肢からは外す(既存データの表示は維持)。 */
const SURVEY_ANSWER_TYPE_OPTIONS: SurveyAnswerType[] = ["checkbox", "radio", "text_short", "text_long"];

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

/** 決済導線ノードは廃止済みのため、新規作成の選択肢からは除外する(既存ノードの表示ラベルはそのまま残す)。 */
const CREATABLE_NODE_TYPES = (Object.keys(NODE_TYPE_LABELS) as ScenarioNodeType[]).filter(
  (type) => type !== "checkout",
);

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

/**
 * このシナリオの商品提示ノードで実際に使われている品番一覧(表示対象の品番+
 * 商品ごとのアップセル・クロスセル対象)。クーポンの対象商品ピッカーの選択候補に使う。
 */
function scenarioRelevantProductIds(nodes: ScenarioNode[]): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.type !== "product") continue;
    const content = node.content as {
      productIds?: string[];
      productUpsell?: Record<string, { upsellProductId?: string; crossSellProductId?: string }>;
    };
    for (const id of content.productIds ?? []) ids.add(id);
    for (const entry of Object.values(content.productUpsell ?? {})) {
      if (entry?.upsellProductId) ids.add(entry.upsellProductId);
      if (entry?.crossSellProductId) ids.add(entry.crossSellProductId);
    }
  }
  return Array.from(ids);
}

/** クーポン設定フォームの初期値/リセット先を、保存済みのクーポン(またはnull)から組み立てる。 */
function couponFormFromCoupon(source: Coupon | null) {
  return {
    name: source?.name ?? "",
    discountType: source?.discountType ?? ("percent" as "percent" | "fixed"),
    discountValue: source ? String(source.discountValue) : "",
    startsAt: source?.startsAt ? source.startsAt.slice(0, 10) : "",
    endsAt: source?.endsAt ? source.endsAt.slice(0, 10) : "",
    maxUses: source?.maxUses ? String(source.maxUses) : "",
    minOrderAmount: source?.minOrderAmount ? String(source.minOrderAmount) : "",
    imageUrl: source?.imageUrl ?? "",
    promoMessage: source?.promoMessage ?? "",
  };
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
function findCheckoutLinks(nodes: ScenarioNode[]): string[] {
  const checkoutNodes = new Map(nodes.filter((n) => n.type === "checkout").map((n) => [n.id, n]));
  if (checkoutNodes.size === 0) return [];

  // 一覧の表示No(1始まり)を付けて、同じ種別のノードが複数あっても区別できるようにする
  const indexById = new Map(nodes.map((n, i) => [n.id, i]));
  const label = (n: ScenarioNode) => `${(indexById.get(n.id) ?? 0) + 1}. ${nodeSummary(n)}`;

  const found: string[] = [];
  const entryNode = nodes[0];
  if (entryNode && entryNode.type === "checkout") {
    found.push(`開始ノードが「${label(entryNode)}」になっています`);
  }
  for (const node of nodes) {
    if (node.type === "product" || node.type === "checkout") continue;
    for (const target of Object.values(node.nextNodeMap)) {
      for (const targetId of resolveTargetNodeIds(target)) {
        const checkoutNode = checkoutNodes.get(targetId);
        if (!checkoutNode) continue;
        found.push(`「${label(node)}」→「${label(checkoutNode)}」`);
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
/**
 * 遷移先の候補や案内文で表示するノードの名称。ノード種別のタイトルのみを返す
 * (例: 「商品提示ノード」)。同じ種別のノードが複数ある場合は、呼び出し側で
 * 一覧の順番(表示No)を前に付けて区別する。
 */
function nodeSummary(node: ScenarioNode): string {
  return `${NODE_TYPE_LABELS[node.type]}ノード`;
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
        <div className="space-y-1 rounded-md border border-neutral-200 bg-sky-50 p-2">
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

/**
 * アップセル・クロスセルの品番選択。対象商品の選択と揃え、アイテム→品番の二段階で選ばせる(任意設定可)。
 * 品番はセット数などを含んで長くなり、ドロップダウンでは末尾が省略されてしまうため、
 * 品番側は全文を折り返して表示できるラジオ形式の一覧にしている。
 */
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
  const radioName = useId();
  // 品番一覧は既定では畳んでおき、選択中の1件(全文表示)だけを見せる。品番名は
  // セット数などで長くなりドロップダウンでは末尾が省略されてしまうため、開いた
  // ときだけ全文を折り返して表示できるラジオ形式の一覧を出す。
  const [expanded, setExpanded] = useState(false);

  function selectProduct(id: string) {
    onChange(id);
    setExpanded(false);
  }

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
  const emptyText = emptyLabel ?? "設定しない";
  const selectedProduct = products.find((p) => p.id === value);
  const summaryText = selectedProduct ? productLabel(selectedProduct) : emptyText;

  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <span className={labelClass}>{label}</span>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`flex w-full items-start justify-between gap-2 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-left hover:bg-neutral-50 ${
          !selectedProduct ? "text-neutral-400" : ""
        }`}
      >
        <span className="leading-snug break-words whitespace-normal">{summaryText}</span>
        <span className="mt-0.5 shrink-0 text-neutral-400">{expanded ? "変更をやめる ▴" : "変更する ▾"}</span>
      </button>
      {expanded && (
        <div className="mt-1 flex flex-col gap-1">
          <select
            className="input w-full"
            value={selectedGroupId}
            onChange={(e) => {
              setSelectedGroupId(e.target.value);
              onChange("");
            }}
          >
            {/* アイテム側でも「設定しない」を選べるようにする(商品を選ぶ前から未設定であることが分かるように) */}
            <option value="">{emptyText}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {selectedGroupId && (
            <div className="space-y-0.5 rounded-md border border-neutral-300 bg-white p-1">
              <ProductRadio
                name={radioName}
                checked={!value}
                onSelect={() => selectProduct("")}
                text={emptyText}
                muted
              />
              {productsInGroup.map((product) => (
                <ProductRadio
                  key={product.id}
                  name={radioName}
                  checked={product.id === value}
                  onSelect={() => selectProduct(product.id)}
                  text={productLabel(product)}
                />
              ))}
              {productsInGroup.length === 0 && (
                <p className="px-2 py-1 text-neutral-400">このアイテムに品番が登録されていません</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 品番1件分の選択行。品番名は省略せず折り返して全文を表示する。 */
function ProductRadio({
  name,
  checked,
  onSelect,
  text,
  muted,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  text: string;
  muted?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 ${
        checked ? "bg-blue-50 font-medium text-blue-900" : "hover:bg-neutral-50"
      } ${muted && !checked ? "text-neutral-400" : ""}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 shrink-0"
      />
      <span className="leading-snug break-words whitespace-normal">{text}</span>
    </label>
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
    // 白い商品カードが浮き上がるよう、マトリクスの土台は薄いブルーにする。
    // min-w-0 がないと横に並べた商品カードの合計幅でページ全体が広がってしまう。
    <div className="min-w-0 space-y-2 rounded-md border border-neutral-300 bg-sky-50 p-3">
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
      <div className="-mx-1 flex max-w-full gap-3 overflow-x-auto px-1 pb-1">
        {productIds.map((id, index) => {
          const entry = value[id] ?? {};
          // 他のスロットで既に選ばれている商品は、この商品選択の候補から除外する(重複表示を防ぐ)
          const availableProducts = products.filter((p) => p.id === id || !productIds.includes(p.id));
          const upsellProduct = products.find((p) => p.id === entry.upsellProductId);
          const crossSellProduct = products.find((p) => p.id === entry.crossSellProductId);
          return (
            <div
              key={index}
              className="w-72 shrink-0 space-y-2 rounded-md border border-neutral-300 bg-white p-2"
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
        <div className="flex w-72 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-neutral-400 p-4">
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
        <div key={index} className="space-y-2 rounded-md border-2 border-neutral-300 bg-sky-50 p-3">
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
                {(type === "date" ? [...SURVEY_ANSWER_TYPE_OPTIONS, "date" as const] : SURVEY_ANSWER_TYPE_OPTIONS).map(
                  (t) => (
                    <option key={t} value={t}>
                      {SURVEY_ANSWER_TYPE_LABELS[t]}
                    </option>
                  ),
                )}
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

/** 固定メニューのレイアウト選択で使う、マス目構成の小さなプレビュー(実際の項目は反映しない見本表示)。 */
function MenuLayoutThumb({ layout }: { layout: MenuLayoutDef }) {
  return (
    <div
      className="grid h-14 w-full overflow-hidden rounded-md border border-neutral-300 bg-neutral-50"
      style={{
        gridTemplateColumns: menuGridTemplateColumns(layout),
        gridTemplateRows: menuGridTemplateRows(layout),
      }}
    >
      {layout.cells.map((cell, index) => (
        <div
          key={index}
          className="flex items-center justify-center border border-neutral-200 bg-white text-[9px] text-neutral-400"
          style={{ gridColumn: menuCellGridColumn(cell), gridRow: menuCellGridRow(cell) }}
        >
          {index + 1}
        </div>
      ))}
    </div>
  );
}

function Accordion({
  title,
  defaultOpen,
  children,
  onSave,
  onCancel,
  saving,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** 指定すると下部のボタンが「保存して閉じる」/「キャンセル」になる(未指定時は「閉じる」のみ)。 */
  onSave?: () => Promise<boolean> | boolean;
  /** 「キャンセル」を押した時、保存していない変更を元に戻す処理(onSaveを指定する場合は必須)。 */
  onCancel?: () => void;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  async function handleSaveAndClose() {
    const ok = await onSave?.();
    if (ok !== false) setOpen(false);
  }

  function handleCancel() {
    onCancel?.();
    setOpen(false);
  }

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
          {onSave ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveAndClose}
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存して閉じる"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              閉じる
            </button>
          )}
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
/**
 * ノードとノードの間に新しいノードを挿入する行。「＋」を押すとノード種別を選ぶ小さなフォームが
 * その場で開き、選んで「作成」するとその位置に空のノードができ、そのまま編集状態が開く。
 */
function InsertNodeRow({
  onCreate,
  disabled,
}: {
  onCreate: (type: ScenarioNodeType) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ScenarioNodeType>("message");

  if (open) {
    return (
      <div className="my-1 flex flex-wrap items-center gap-2 rounded-md border border-blue-300 bg-white p-2">
        <select
          className="input w-auto"
          value={type}
          onChange={(e) => setType(e.target.value as ScenarioNodeType)}
        >
          {CREATABLE_NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {NODE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen(false);
            onCreate(type);
          }}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          作成
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
        >
          キャンセル
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="ここに新しいノードを追加"
        className="rounded-full border border-neutral-300 bg-white px-3 py-0.5 text-xs text-neutral-400 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40"
      >
        ＋
      </button>
      <span className="text-xs text-neutral-400">ノードを追加</span>
    </div>
  );
}

/** ノード間の「隙間」。ドラッグ中に指(ポインター)がここに重なると青い線を表示する。 */
function DropGuide({ active }: { active: boolean }) {
  return (
    <div className="relative h-3">
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
  checkoutFieldOrder: CheckoutFieldKey[];
}

export function ScenarioEditor({
  scenario,
  nodes,
  products,
  menuItems: initialMenuItems,
  coupon: initialCoupon,
  checkoutFieldOrder,
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
  // 「キャンセル」で戻す先(直前に保存した値)。scenario propは保存後すぐには更新されないため別途保持する。
  const [savedAdTagDraft, setSavedAdTagDraft] = useState(scenario.adTag ?? "");
  const [adTagSaving, setAdTagSaving] = useState(false);

  const [conversionTagDraft, setConversionTagDraft] = useState(scenario.conversionTag ?? "");
  const [savedConversionTagDraft, setSavedConversionTagDraft] = useState(scenario.conversionTag ?? "");
  const [conversionTagSaving, setConversionTagSaving] = useState(false);


  const [popupIconUrlDraft, setPopupIconUrlDraft] = useState(scenario.popupIconUrl ?? "");
  const [savedPopupIconUrlDraft, setSavedPopupIconUrlDraft] = useState(scenario.popupIconUrl ?? "");
  const [popupIconUrlSaving, setPopupIconUrlSaving] = useState(false);
  const [popupButtonTextDraft, setPopupButtonTextDraft] = useState(scenario.popupButtonText ?? "");
  const [savedPopupButtonTextDraft, setSavedPopupButtonTextDraft] = useState(scenario.popupButtonText ?? "");
  const [popupPosition, setPopupPositionState] = useState<"bottom-right" | "bottom-left">(
    scenario.popupPosition ?? "bottom-right",
  );
  const [savedPopupPosition, setSavedPopupPosition] = useState<"bottom-right" | "bottom-left">(
    scenario.popupPosition ?? "bottom-right",
  );
  const [couponCodeFieldEnabled, setCouponCodeFieldEnabledState] = useState(
    scenario.couponCodeFieldEnabled,
  );
  const [coupon, setCoupon] = useState<Coupon | null>(initialCoupon);
  const [couponForm, setCouponForm] = useState(couponFormFromCoupon(initialCoupon));
  // 対象商品を限定する場合の設定。チェックを外すと制限なし(全商品に適用可能)で保存する。
  const [couponTargetProductsEnabled, setCouponTargetProductsEnabled] = useState(
    Boolean(initialCoupon?.targetProductIds && initialCoupon.targetProductIds.length > 0),
  );
  const [couponTargetProductIds, setCouponTargetProductIds] = useState<string[]>(
    initialCoupon?.targetProductIds ?? [],
  );
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponSaved, setCouponSaved] = useState(false);
  const couponSkipResetRef = useRef(true);
  useEffect(() => {
    if (couponSkipResetRef.current) {
      couponSkipResetRef.current = false;
      return;
    }
    setCouponSaved(false);
  }, [couponForm, couponTargetProductsEnabled, couponTargetProductIds]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  /** ノード間の「＋」で作った直後のノードID。該当するNodeCardが自動的に編集状態を開く。 */
  const [autoEditNodeId, setAutoEditNodeId] = useState<string | null>(null);
  /** ノードの追加・並び替え中は、続けて操作されないようボタンを無効化する */
  const [nodeOpPending, setNodeOpPending] = useState(false);
  const [dragOverGap, setDragOverGap] = useState<number | null>(null);
  // ノードカードのDOM要素(並び替え中に指の位置と各カードの位置を比較して、どの隙間に重なっているか判定するため)
  const nodeCardRefs = useRef<Array<HTMLDivElement | null>>([]);

  /** 長押しドラッグ中、指(ポインター)のY座標から、どの隙間に重なっているかを判定する。 */
  function handleNodeDragMove(clientY: number) {
    const rects = nodeCardRefs.current.map((el) => el?.getBoundingClientRect() ?? null);
    let gap = rects.length;
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      if (rect && clientY < rect.top + rect.height / 2) {
        gap = i;
        break;
      }
    }
    setDragOverGap(gap);
  }

  /** 長押しドラッグを指を離して確定する。重なっていた隙間があればそこへ移動、なければ何もしない。 */
  function handleNodeDrop() {
    if (dragOverGap !== null) {
      handleGapDrop(dragOverGap);
    } else {
      setDraggingIndex(null);
    }
  }
  const [menuItems, setMenuItems] = useState<ScenarioMenuItem[]>(initialMenuItems);
  const [menuLayoutKey, setMenuLayoutKeyState] = useState(scenario.menuLayoutKey);
  const [menuLayoutFilterRows, setMenuLayoutFilterRows] = useState<"all" | 1 | 2>("all");
  const [menuLayoutFilterCells, setMenuLayoutFilterCells] = useState<"all" | number>("all");
  const [menuImageUrlDraft, setMenuImageUrlDraft] = useState(scenario.menuImageUrl ?? "");
  const [menuImagePreviewFailed, setMenuImagePreviewFailed] = useState(false);
  const [menuImageUrlSaving, setMenuImageUrlSaving] = useState(false);
  const menuLayoutCapacityValue = getMenuLayout(menuLayoutKey).cells.length;
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

  // 同じ種別のノードが複数あっても区別できるよう、一覧の表示No(1始まり)を前に付ける
  const nodeOptions = nodes.map((n, i) => ({ id: n.id, summary: `${i + 1}. ${nodeSummary(n)}` }));
  // クーポンの対象商品として選べるのは、このシナリオの商品提示ノードやアップセル・クロスセルで
  // 実際に使われている商品のみ(カタログ全体から選ばせると関係ない商品まで並んでしまうため)。
  const couponCandidateProductIds = scenarioRelevantProductIds(nodes);
  const couponCandidateProducts = products.filter((p) => couponCandidateProductIds.includes(p.id));

  async function togglePublish() {
    // 公開時のみ検証する(下書きに戻す操作は途中の状態でも通す)
    if (scenario.status !== "published") {
      const invalidLinks = findCheckoutLinks(nodes);
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
        message: `シナリオコードの設定に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
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

  async function handleSaveAdTag(): Promise<boolean> {
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
      return false;
    }
    setSavedAdTagDraft(adTagDraft);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
    return true;
  }

  async function handleSaveConversionTag(): Promise<boolean> {
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
      return false;
    }
    setSavedConversionTagDraft(conversionTagDraft);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
    return true;
  }

  /** タグ設定アコーディオンの「保存して閉じる」。広告タグ・コンバージョンタグをまとめて保存する。 */
  async function handleSaveTagSettings(): Promise<boolean> {
    const [adOk, conversionOk] = await Promise.all([handleSaveAdTag(), handleSaveConversionTag()]);
    return adOk && conversionOk;
  }

  function handleCancelTagSettings() {
    setAdTagDraft(savedAdTagDraft);
    setConversionTagDraft(savedConversionTagDraft);
  }

  /** ポップアップ設定アコーディオンの「保存して閉じる」。アイコン画像URL・表示位置・ボタン文言をまとめて保存する。 */
  async function handleSavePopupSettings(): Promise<boolean> {
    setPopupIconUrlSaving(true);
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        popupIconUrl: popupIconUrlDraft.trim() || null,
        popupPosition,
        popupButtonText: popupButtonTextDraft.trim() || null,
      }),
    });
    setPopupIconUrlSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `ポップアップ設定の保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return false;
    }
    setSavedPopupIconUrlDraft(popupIconUrlDraft);
    setSavedPopupPosition(popupPosition);
    setSavedPopupButtonTextDraft(popupButtonTextDraft);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
    return true;
  }

  function handleCancelPopupSettings() {
    setPopupIconUrlDraft(savedPopupIconUrlDraft);
    setPopupPositionState(savedPopupPosition);
    setPopupButtonTextDraft(savedPopupButtonTextDraft);
  }

  /** 表示位置はポップアップ設定アコーディオンの「保存して閉じる」でまとめて保存するため、ここでは下書きの更新のみ行う。 */
  function setPopupPosition(position: "bottom-right" | "bottom-left") {
    setPopupPositionState(position);
  }

  function setCouponCodeFieldEnabled(enabled: boolean) {
    setCouponCodeFieldEnabledState(enabled);
    patchDisplaySettings({ couponCodeFieldEnabled: enabled });
  }

  function handleSelectMenuLayout(key: string) {
    setMenuLayoutKeyState(key);
    patchDisplaySettings({ menuLayoutKey: key });
  }

  async function handleSaveMenuImageUrl(): Promise<boolean> {
    setMenuImageUrlSaving(true);
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ menuImageUrl: menuImageUrlDraft.trim() || null }),
    });
    setMenuImageUrlSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `固定メニュー画像の保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return false;
    }
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
    return true;
  }

  async function handleSaveCoupon(): Promise<boolean> {
    if (!couponForm.name.trim() || !couponForm.discountValue) {
      setToast({ message: "名称と割引額を入力してください", type: "error" });
      return false;
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
      targetProductIds: couponTargetProductsEnabled && couponTargetProductIds.length > 0
        ? couponTargetProductIds
        : null,
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
      return false;
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
      targetProductIds: saved.target_product_ids,
      createdAt: saved.created_at,
      updatedAt: saved.updated_at,
    });
    setCouponSaved(true);
    setToast({ message: "保存しました", type: "success" });
    return true;
  }

  function handleCancelCouponSettings() {
    setCouponForm(couponFormFromCoupon(coupon));
    setCouponTargetProductsEnabled(Boolean(coupon?.targetProductIds && coupon.targetProductIds.length > 0));
    setCouponTargetProductIds(coupon?.targetProductIds ?? []);
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

    if (menuItems.length >= menuLayoutCapacityValue) {
      setToast({
        message: `選択中のレイアウトの上限(${menuLayoutCapacityValue}件)に達しています`,
        type: "error",
      });
      return;
    }
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

  /**
   * ノードとノードの間の「＋」で、その位置に指定した種別の空ノードを作る。
   * APIは常に末尾に作るため、作成後に表示順を振り直して指定位置へ入れる。
   * 作成直後は内容が空なので、そのまま編集画面を開いて入力できるようにする
   * (autoEditNodeId → NodeCard側で自動的に「編集」状態にする)。
   */
  async function insertNodeAt(position: number, type: ScenarioNodeType) {
    setNodeOpPending(true);
    try {
      const res = await fetch(`/api/scenarios/${scenario.id}/nodes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, content: {} }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setToast({
          message: `ノードの追加に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
          type: "error",
        });
        return;
      }
      const created = (await res.json()) as { node: { id: string } };
      const patchNode = (nodeId: string, payload: Record<string, unknown>) =>
        fetch(`/api/scenarios/${scenario.id}/nodes/${nodeId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

      const insertIndex = Math.max(0, Math.min(nodes.length, position - 1));
      const orderedIds = [
        ...nodes.slice(0, insertIndex).map((n) => n.id),
        created.node.id,
        ...nodes.slice(insertIndex).map((n) => n.id),
      ];
      await Promise.all(orderedIds.map((id, i) => patchNode(id, { displayOrder: i })));

      // 前後のノードが直接繋がっている場合は、挿入したノードを経由するよう繋ぎ直す
      const prev = nodes[insertIndex - 1];
      const next = nodes[insertIndex];
      if (prev && next && prev.nextNodeMap.default === next.id) {
        await patchNode(prev.id, { nextNodeMap: { ...prev.nextNodeMap, default: created.node.id } });
        await patchNode(created.node.id, { nextNodeMap: { default: next.id } });
      }
      setAutoEditNodeId(created.node.id);
      router.refresh();
    } finally {
      setNodeOpPending(false);
    }
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

    setNodeOpPending(true);

    const results = await Promise.all(
      Array.from(patches.entries()).map(([nodeId, patch]) =>
        fetch(`/api/scenarios/${scenario.id}/nodes/${nodeId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        }),
      ),
    );
    setNodeOpPending(false);
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
              placeholder="英字2文字+数字4桁(例: PM0001、空欄でデフォルトのXXを使用)"
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
              シナリオコード(受注番号の識別コード。英字2文字+数字4桁):{" "}
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

      <div className="mb-8 min-w-0">
        <DropGuide active={draggingIndex !== null && dragOverGap === 0} />
        <InsertNodeRow disabled={nodeOpPending} onCreate={(type) => insertNodeAt(1, type)} />
        {nodes.map((node, index) => (
          <div key={node.id} className="min-w-0">
            <div
              ref={(el) => {
                nodeCardRefs.current[index] = el;
              }}
              className={`min-w-0 ${draggingIndex === index ? "opacity-40" : ""}`}
            >
              <NodeCard
                scenarioId={scenario.id}
                node={node}
                isFirst={index === 0}
                isLast={index === nodes.length - 1}
                orderNumber={index + 1}
                onMakeEntry={() => moveNodeToPosition(index, 1)}
                onMoveUp={() => moveNodeToPosition(index, index)}
                onMoveDown={() => moveNodeToPosition(index, index + 2)}
                onDragStart={() => setDraggingIndex(index)}
                onDragMove={handleNodeDragMove}
                onDrop={handleNodeDrop}
                onDragEnd={() => {
                  setDraggingIndex(null);
                  setDragOverGap(null);
                }}
                products={products}
                allNodes={nodes}
                nodeOptions={nodeOptions.filter((n) => n.id !== node.id)}
                onDelete={() => handleDeleteNode(node.id)}
                showToast={setToast}
                showErrorDialog={setErrorDialog}
                autoEdit={autoEditNodeId === node.id}
                onAutoEditHandled={() => setAutoEditNodeId(null)}
              />
            </div>
            <DropGuide active={draggingIndex !== null && dragOverGap === index + 1} />
            <InsertNodeRow disabled={nodeOpPending} onCreate={(type) => insertNodeAt(index + 2, type)} />
          </div>
        ))}
        {nodes.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
            ノードがまだありません
          </p>
        )}
        <ScenarioCheckoutFieldsSection scenarioId={scenario.id} initialOrder={checkoutFieldOrder} />
      </div>

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

        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700">レイアウト</h3>
          <p className="mb-3 text-xs text-neutral-500">
            段数・コマ数を選択できます。現在のレイアウトの上限を超えるボタンは表示されません。
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              段数:
              <select
                className="input"
                value={menuLayoutFilterRows}
                onChange={(e) =>
                  setMenuLayoutFilterRows(e.target.value === "all" ? "all" : (Number(e.target.value) as 1 | 2))
                }
              >
                <option value="all">すべて</option>
                <option value="1">1段</option>
                <option value="2">2段</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              コマ数:
              <select
                className="input"
                value={menuLayoutFilterCells}
                onChange={(e) =>
                  setMenuLayoutFilterCells(e.target.value === "all" ? "all" : Number(e.target.value))
                }
              >
                <option value="all">すべて</option>
                {Array.from(new Set(MENU_LAYOUTS.map((l) => l.cells.length)))
                  .sort((a, b) => a - b)
                  .map((count) => (
                    <option key={count} value={count}>
                      {count}コマ
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MENU_LAYOUTS.filter(
              (l) =>
                (menuLayoutFilterRows === "all" || l.rows === menuLayoutFilterRows) &&
                (menuLayoutFilterCells === "all" || l.cells.length === menuLayoutFilterCells),
            ).map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => handleSelectMenuLayout(l.key)}
                className={`rounded-lg border p-2 text-left ${
                  menuLayoutKey === l.key ? "border-blue-500 ring-2 ring-blue-100" : "border-neutral-200"
                }`}
              >
                <MenuLayoutThumb layout={l} />
                <p className="mt-1 text-[11px] font-medium text-neutral-700">{l.label}</p>
              </button>
            ))}
          </div>
          {menuItems.length > menuLayoutCapacityValue && (
            <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              現在のボタン数({menuItems.length}件)が選択中のレイアウトの上限({menuLayoutCapacityValue}件)を超えています。
              上限を超える分は画面に表示されません。
            </p>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700">画像モード(任意)</h3>
          <p className="mb-3 text-xs text-neutral-500">
            画像を設定すると、下記のテキストボタンの代わりに画像1枚を表示し、選択中のレイアウトのマス目に
            対応する位置をクリック領域として使います(ボタンのラベルはクリック領域の説明用として使われるだけで、
            画面には表示されません)。画像とテキストボタンを両方設定した場合は画像が優先されます。
          </p>
          <p className="mb-3 rounded-md bg-neutral-50 p-2 text-xs text-neutral-500">
            推奨画像サイズ(横幅いっぱいに表示され、高さは画像の比率に応じて自動調整されます)
            <br />
            ・1段レイアウトの場合: 2500×843px / 1200×405px / 800×270px(比率 約2.96:1)
            <br />
            ・2段レイアウトの場合: 2500×1686px / 1200×810px / 800×540px(比率 約1.48:1)
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">画像URL</span>
            <div className="flex flex-wrap gap-2">
              <input
                className="input w-full max-w-md"
                value={menuImageUrlDraft}
                onChange={(e) => {
                  setMenuImageUrlDraft(e.target.value);
                  setMenuImagePreviewFailed(false);
                }}
                placeholder="https://example.com/menu.jpg"
              />
              <button
                type="button"
                onClick={handleSaveMenuImageUrl}
                disabled={menuImageUrlSaving}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                {menuImageUrlSaving ? "更新中..." : "更新"}
              </button>
            </div>
          </label>
          {menuImageUrlDraft.trim() && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-neutral-500">プレビュー</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={menuImageUrlDraft.trim()}
                alt=""
                className="max-w-md rounded-md border border-neutral-200"
                onLoad={() => setMenuImagePreviewFailed(false)}
                onError={() => setMenuImagePreviewFailed(true)}
              />
              {menuImagePreviewFailed && (
                <p className="mt-1 rounded-md bg-red-50 p-2 text-xs text-red-700">
                  画像を読み込めませんでした。このURLは画面に直接表示できない可能性があります。
                  {menuImageUrlDraft.includes("drive.google.com") &&
                    "Google Driveの共有リンク(view)は直接の画像URLとして使えません。"}
                  画像ホスティングサービス等の、拡張子(.jpg/.pngなど)で直接画像が開けるURLを指定してください。
                  このまま保存すると、チャット上でも画像が表示されません。
                </p>
              )}
            </div>
          )}
        </div>

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
                  <div className="min-w-0 flex-1">
                    <span className="font-medium break-words">{item.label}</span>
                    {/* URLは長くなるため枠内で折り返す */}
                    <span className="ml-2 text-xs break-all text-neutral-500">
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

        {menuItems.length >= menuLayoutCapacityValue && (
          <p className="text-xs text-amber-700">
            選択中のレイアウトの上限({menuLayoutCapacityValue}件)に達しています。追加するにはレイアウトを変更してください。
          </p>
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
            disabled={menuItems.length >= menuLayoutCapacityValue}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            追加
          </button>
        </form>
      </Accordion>

      <Accordion
        title="ポップアップ設定"
        onSave={handleSavePopupSettings}
        onCancel={handleCancelPopupSettings}
        saving={popupIconUrlSaving}
      >
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
              onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.blur()}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              更新
            </button>
          </div>
        </label>
        {!popupIconUrlDraft.trim() && (
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">
              テキストボタンの文言(未設定で「チャットで相談する」)
            </span>
            <input
              type="text"
              value={popupButtonTextDraft}
              onChange={(e) => setPopupButtonTextDraft(e.target.value)}
              placeholder="チャットで相談する"
              className="input w-full"
            />
          </label>
        )}
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

      <Accordion
        title="クーポン設定"
        onSave={handleSaveCoupon}
        onCancel={handleCancelCouponSettings}
        saving={couponSaving}
      >
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={couponTargetProductsEnabled}
                onChange={(e) => setCouponTargetProductsEnabled(e.target.checked)}
              />
              対象商品を指定する(チェックしない場合は全商品に適用可能)
            </label>
            <p className="mt-1 text-xs text-neutral-500">
              対象商品を指定しても、最低注文金額など他の条件は商品代金の合計に対して判定されます。
              例: 3,000円の対象商品でも、最低注文金額5,000円以上のクーポンの場合、その商品を2点購入したり、
              クロスセル商品とまとめ買いして合計5,000円以上になった場合に適用されます。
            </p>
            {couponTargetProductsEnabled && (
              <Accordion
                title={`対象商品を選択${couponTargetProductIds.length > 0 ? `(${couponTargetProductIds.length}件選択中)` : ""}`}
                defaultOpen
              >
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-neutral-300 bg-white p-2">
                  {couponCandidateProducts.length === 0 ? (
                    <p className="text-xs text-neutral-400">
                      商品提示ノードやアップセル・クロスセルで使用中の商品がありません。先に商品提示ノードで商品を設定してください。
                    </p>
                  ) : (
                    couponCandidateProducts.map((product) => (
                      <label
                        key={product.id}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-50"
                      >
                        <input
                          type="checkbox"
                          checked={couponTargetProductIds.includes(product.id)}
                          onChange={(e) =>
                            setCouponTargetProductIds((prev) =>
                              e.target.checked
                                ? [...prev, product.id]
                                : prev.filter((id) => id !== product.id),
                            )
                          }
                        />
                        {productLabel(product)}
                      </label>
                    ))
                  )}
                </div>
              </Accordion>
            )}
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

      <Accordion
        title="タグ設定"
        onSave={handleSaveTagSettings}
        onCancel={handleCancelTagSettings}
        saving={adTagSaving || conversionTagSaving}
      >
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
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {adTagSaving ? "更新中..." : "更新"}
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
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {conversionTagSaving ? "更新中..." : "更新"}
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
  isLast,
  orderNumber,
  onMakeEntry,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragMove,
  onDrop,
  onDragEnd,
  onDelete,
  showToast,
  showErrorDialog,
  autoEdit,
  onAutoEditHandled,
}: {
  scenarioId: string;
  node: ScenarioNode;
  products: PickableProduct[];
  allNodes: ScenarioNode[];
  nodeOptions: { id: string; summary: string }[];
  isFirst: boolean;
  isLast: boolean;
  /** 一覧での並び順(1始まり) */
  orderNumber: number;
  onMakeEntry: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** タイトル部分を長押しした瞬間(選択状態になり、並び替えを開始する) */
  onDragStart: () => void;
  /** 選択状態のまま指(ポインター)を動かした時。clientYは画面上のY座標。 */
  onDragMove: (clientY: number) => void;
  /** 選択状態のまま指を離した時。重なっている隙間があればそこへ移動する。 */
  onDrop: () => void;
  /** 選択状態を解除する(移動せずに終了する場合も含む) */
  onDragEnd: () => void;
  onDelete: () => void;
  showToast: (toast: { message: string; type: "success" | "error" }) => void;
  showErrorDialog: (dialog: { title: string; description?: string; items?: string[] }) => void;
  /** 「＋」で作った直後のノードの場合true。マウント時に自動で編集状態を開く。 */
  autoEdit?: boolean;
  onAutoEditHandled?: () => void;
}) {
  const router = useRouter();
  // 「＋」で作った直後のノードは、開いた時点で中身が空(node.content === {})なので
  // 以下の各フィールドの初期値もそのまま編集用の初期値として使え、最初から編集状態で開いてよい
  const [editing, setEditing] = useState(Boolean(autoEdit));
  const cardRef = useRef<HTMLDivElement>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  // 編集中であることをグローバルメニュー側と共有する(未保存のままページ遷移しようとした際に
  // 確認ポップアップを出すため)。保存処理の実体は毎レンダー最新のものをrefで参照する。
  useEffect(() => {
    if (!editing) return;
    markEditingStart();
    registerSaveHandler(() => handleSaveRef.current());
    return () => {
      markEditingEnd();
      registerSaveHandler(null);
    };
  }, [editing]);

  // 編集中にこのノードの外をタップ(クリック)した場合、そのままでは操作が実行されてしまうため
  // クリックの既定動作とバブリングを止めて、代わりに保存確認ポップアップを出す。
  // スクロール操作はclickイベントを発生させないため、誤反応しない。
  useEffect(() => {
    if (!editing) return;
    function handleClickCapture(e: MouseEvent) {
      if (cardRef.current && e.target instanceof Node && !cardRef.current.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        setShowLeaveConfirm(true);
      }
    }
    document.addEventListener("click", handleClickCapture, true);
    return () => document.removeEventListener("click", handleClickCapture, true);
  }, [editing]);
  // タイトル部分の長押しで並び替えを開始する(ドラッグ用の小さいアイコンだと掴みづらいため、
  // 見出しの帯全体をドラッグ対応にしている)。長押し前に指が動いたら通常のスクロールとして扱う。
  const [dragSelected, setDragSelected] = useState(false);
  const longPressState = useRef<{ timer: ReturnType<typeof setTimeout> | null; startX: number; startY: number; active: boolean }>(
    { timer: null, startX: 0, startY: 0, active: false },
  );
  const LONG_PRESS_MS = 450;
  const LONG_PRESS_MOVE_TOLERANCE = 10;

  function clearLongPressTimer() {
    if (longPressState.current.timer) {
      clearTimeout(longPressState.current.timer);
      longPressState.current.timer = null;
    }
  }

  function handleTitlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressState.current.startX = e.clientX;
    longPressState.current.startY = e.clientY;
    longPressState.current.active = false;
    clearLongPressTimer();
    longPressState.current.timer = setTimeout(() => {
      longPressState.current.active = true;
      setDragSelected(true);
      onDragStart();
    }, LONG_PRESS_MS);
  }

  function handleTitlePointerMove(e: React.PointerEvent) {
    if (!longPressState.current.active) {
      const dx = e.clientX - longPressState.current.startX;
      const dy = e.clientY - longPressState.current.startY;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) clearLongPressTimer();
      return;
    }
    e.preventDefault();
    onDragMove(e.clientY);
  }

  function handleTitlePointerUp(e: React.PointerEvent) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    clearLongPressTimer();
    const wasActive = longPressState.current.active;
    longPressState.current.active = false;
    setDragSelected(false);
    if (wasActive) onDrop();
  }

  function handleTitlePointerCancel(e: React.PointerEvent) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    clearLongPressTimer();
    const wasActive = longPressState.current.active;
    longPressState.current.active = false;
    setDragSelected(false);
    if (wasActive) onDragEnd();
  }
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
  // クーポン対象商品提示: このクーポンが1点でも適用される商品だけを、通常の商品提示ノードと同様に
  // カルーセルで見せる(商品を選ぶとそのまま決済フォームへ進む)。既に商品が選ばれている場合は
  // 表示せず、クーポンの告知(お知らせ)のみを流す。
  const [couponShowTargetProducts, setCouponShowTargetProducts] = useState(
    Boolean(node.content.showTargetProducts),
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
    setCouponShowTargetProducts(Boolean(node.content.showTargetProducts));
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

  // 親の「自動編集」フラグは一度使ったら消してもらう(この後ノードを増やしても再度開かないように)
  useEffect(() => {
    if (autoEdit) onAutoEditHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

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
      content = { ...(couponShowTargetProducts && { showTargetProducts: true }) };
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
          const targetIndex = allNodes.findIndex((n) => n.id === id);
          const target = targetIndex >= 0 ? allNodes[targetIndex] : undefined;
          return `「${target ? `${targetIndex + 1}. ${nodeSummary(target)}` : id}」`;
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
    <div
      ref={cardRef}
      className={`min-w-0 rounded-lg border-2 bg-white p-3 ${
        dragSelected ? "border-blue-500" : "border-neutral-200"
      }`}
    >
      {showLeaveConfirm && (
        <SaveConfirmDialog
          saving={saving}
          onCancel={() => setShowLeaveConfirm(false)}
          onSave={async () => {
            await handleSave();
            setShowLeaveConfirm(false);
          }}
        />
      )}
      {/* ▲▼は移動専用の小さいボタン、その右のタイトル帯(No+種別名)は長押しで
          ドラッグ並び替えを開始する(小さいアイコンより掴みやすいよう帯全体を対象にしている) */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex shrink-0 gap-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={onMoveUp}
              title="上に移動"
              className="flex h-6 w-6 items-center justify-center rounded text-xs text-neutral-400 hover:bg-neutral-100 disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={onMoveDown}
              title="下に移動"
              className="flex h-6 w-6 items-center justify-center rounded text-xs text-neutral-400 hover:bg-neutral-100 disabled:opacity-30"
            >
              ▼
            </button>
          </div>
          <div
            onPointerDown={handleTitlePointerDown}
            onPointerMove={handleTitlePointerMove}
            onPointerUp={handleTitlePointerUp}
            onPointerCancel={handleTitlePointerCancel}
            title="長押しして並び替え"
            className="flex min-w-0 flex-1 touch-none items-center gap-1.5 rounded px-1 py-1 select-none"
          >
            <span className="shrink-0 text-sm font-bold text-neutral-700">{orderNumber}</span>
            <span className="truncate rounded bg-neutral-100 px-2 py-0.5 text-xs">
              {NODE_TYPE_LABELS[node.type]}
              {isFirst && " ・開始ノード"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-3 text-xs">
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
            <>
              <p className="rounded-md bg-sky-50 p-3 text-xs text-neutral-600">
                このシナリオの自動適用クーポンの告知画像・メッセージが、このノードの位置で表示されます。
                内容は「表示設定」内の「クーポン設定」から編集してください。
              </p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={couponShowTargetProducts}
                  onChange={(e) => setCouponShowTargetProducts(e.target.checked)}
                />
                クーポン対象商品提示(1点でも購入すればこのクーポンが適用される商品だけを、
                商品提示ノードと同様にカルーセルで表示します。すでに商品が選ばれている場合は表示せず、
                クーポンのお知らせのみを表示します)
              </label>
            </>
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
            <div className="rounded bg-sky-50 p-2 text-xs">
              {/* 商品ごとの行き先は個別指定しない(商品を選ぶと共通の決済フォームへ直接進む)ため、
                  ここでは各商品名とアップセル・クロスセル対象のみを表示する。次のノードは
                  他のノードと同様、このブロックの下に1回だけ表示する。 */}
              {productIds.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {productIds.map((id) => {
                    const product = products.find((p) => p.id === id);
                    const upsell = productUpsellMap[id];
                    const upsellName = upsell?.upsellProductId
                      ? products.find((p) => p.id === upsell.upsellProductId)?.name
                      : undefined;
                    const crossSellName = upsell?.crossSellProductId
                      ? products.find((p) => p.id === upsell.crossSellProductId)?.name
                      : undefined;
                    return (
                      <li key={id}>
                        {product ? productLabel(product) : "未設定"}
                        {(upsellName || crossSellName) && (
                          <span className="text-red-600">
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
            <p className="rounded bg-sky-50 p-2 text-xs">
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
            <div className="rounded bg-sky-50 p-2 text-xs whitespace-pre-wrap">
              {truncate(text, 40) || "(未設定)"}
              {imageUrl && <p className="mt-1 text-neutral-400">画像: {imageUrl}</p>}
            </div>
          ) : node.type === "image" ? (
            <div className="rounded bg-sky-50 p-2 text-xs">
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
            <div className="rounded bg-sky-50 p-2 text-xs">
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
            <div className="rounded bg-sky-50 p-2 text-xs">
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
            <p className="rounded bg-sky-50 p-2 text-xs text-neutral-500">
              このシナリオの自動適用クーポンの告知画像・メッセージを表示します
              {couponShowTargetProducts && "(クーポン対象商品提示: 有効)"}
            </p>
          ) : (
            <div className="rounded bg-sky-50 p-2 text-xs whitespace-pre-wrap">
              {truncate(text, 40) || "(未設定)"}
              {options.length > 0 && (
                <p className="mt-1 text-neutral-500">
                  選択肢: {options.map((o) => o.label || o.value).join("、")}
                </p>
              )}
            </div>
          )}
          <div className="mt-1 rounded bg-sky-50 p-2 text-xs text-neutral-500">
            <span className="mr-1">▶</span>
            {node.type === "choice" ? (
              (() => {
                const lines = options
                  .map((o) => {
                    if (o.qaProductId) {
                      const groupName =
                        products.find((p) => p.id === o.qaProductId)?.productGroupName ?? "未設定";
                      const after = nodeOptions.find((n) => n.id === o.nextNodeId);
                      return `${o.label || o.value}→Q&A表示(${groupName})→${after?.summary ?? "自動: 次のノード"}`;
                    }
                    const target = nodeOptions.find((n) => n.id === o.nextNodeId);
                    return target ? `${o.label || o.value}→${target.summary}` : null;
                  })
                  .filter((line): line is string => Boolean(line));
                if (lines.length === 0) {
                  return <span>{nodeOptions.find((n) => n.id === defaultNext)?.summary ?? "自動: 次のノード"}</span>;
                }
                // 選択肢が複数あると1行にまとめると読みづらいため、改行して「・」を付ける
                return (
                  <div className="mt-0.5 space-y-0.5">
                    {lines.map((line, i) => (
                      <p key={i}>・{line}</p>
                    ))}
                  </div>
                );
              })()
            ) : (
              <span>{nodeOptions.find((n) => n.id === defaultNext)?.summary ?? "自動: 次のノード"}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
