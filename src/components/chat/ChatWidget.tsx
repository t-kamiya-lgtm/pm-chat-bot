"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import type { WidgetMenuItem, WidgetProduct, WidgetScenarioNode } from "@/components/chat/types";
import type { SurveyQuestion } from "@/lib/types";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { BusinessCalendarView } from "@/components/chat/BusinessCalendarView";
import { ChoiceButtons, type ChoiceOption } from "@/components/chat/ChoiceButtons";
import { ProductCarousel } from "@/components/chat/ProductCarousel";
import { ProductDetailPanel } from "@/components/chat/ProductDetailPanel";
import { CheckoutForm } from "@/components/chat/CheckoutForm";
import { FaqPanel } from "@/components/chat/FaqPanel";
import { SurveyForm } from "@/components/chat/SurveyForm";
import { effectiveTextColor } from "@/lib/color";
import { getMenuLayout, menuCellGridColumn, menuCellGridRow, menuGridTemplateColumns, menuGridTemplateRows } from "@/lib/menu-layouts";
import { ImageCarousel } from "@/components/chat/ImageCarousel";
import { VideoPlayer } from "@/components/chat/VideoPlayer";
import { CouponCard } from "@/components/chat/CouponCard";

interface GreetingItem {
  type: "image" | "text";
  imageUrl?: string;
  linkUrl?: string;
  text?: string;
}

/** 商品ノード側で商品ごとに設定できるアップセル・クロスセル(あればcheckoutノード自身の設定より優先)。 */
interface ProductUpsellEntry {
  upsellProductId?: string;
  upsellImageUrl?: string;
  upsellComment?: string;
  crossSellProductId?: string;
  crossSellImageUrl?: string;
  crossSellComment?: string;
}

/**
 * 商品提示ノードだけでアップセル・クロスセルを完結させるための解決処理。
 * 商品提示ノード自身の設定(content.productUpsell)が最優先。
 * 旧仕様(決済導線ノード側に設定する2ノード構成)のシナリオでも同じ表示になるよう、
 * 未設定の場合は ①その商品の遷移先の決済導線ノード ②共通の遷移先の決済導線ノード
 * ③同じ品番を対象にしている決済導線ノード の順に設定を引き継ぐ。
 */
/**
 * クーポン対象商品提示で表示する品番一覧。「1点でも購入すればこのクーポンが適用される」商品だけを返す
 * (最低注文金額がある場合、その商品単体の価格が満たしていることが条件)。
 * 対象商品が限定されているクーポンはその一覧を、限定なしの場合はこのシナリオの商品提示ノードで
 * 使われている品番全体を候補にする(カタログ全体から選ばせると無関係な商品まで並ぶため)。
 */
function computeCouponEligibleProductIds(
  coupon: { minOrderAmount: number | null; targetProductIds: string[] | null },
  productMap: Record<string, WidgetProduct>,
  nodeMap: Record<string, WidgetScenarioNode>,
): string[] {
  const pool =
    coupon.targetProductIds && coupon.targetProductIds.length > 0
      ? coupon.targetProductIds
      : Array.from(
          new Set(
            Object.values(nodeMap)
              .filter((n) => n.type === "product")
              .flatMap((n) => {
                const ids = (n.content as { productIds?: string[] }).productIds;
                return Array.isArray(ids) ? ids : [];
              }),
          ),
        );
  return pool.filter((id) => {
    const product = productMap[id];
    return Boolean(product) && product.price >= (coupon.minOrderAmount ?? 0);
  });
}

function resolveProductUpsell(
  node: WidgetScenarioNode | undefined,
  productId: string,
  nodeMap: Record<string, WidgetScenarioNode>,
): ProductUpsellEntry | undefined {
  const own = (node?.content as { productUpsell?: Record<string, ProductUpsellEntry> } | undefined)
    ?.productUpsell?.[productId];
  if (own) return own;

  const fromCheckout = (candidate: WidgetScenarioNode | undefined): ProductUpsellEntry | undefined => {
    if (candidate?.type !== "checkout") return undefined;
    const content = candidate.content as Record<string, string | undefined>;
    if (!content.upsellProductId && !content.crossSellProductId) return undefined;
    return {
      upsellProductId: content.upsellProductId || undefined,
      upsellImageUrl: content.upsellImageUrl || undefined,
      upsellComment: content.upsellComment || undefined,
      crossSellProductId: content.crossSellProductId || undefined,
      crossSellImageUrl: content.crossSellImageUrl || undefined,
      crossSellComment: content.crossSellComment || undefined,
    };
  };

  const routedId = node?.next_node_map[productId];
  const defaultId = node?.next_node_map.default;
  return (
    fromCheckout(routedId ? nodeMap[routedId] : undefined) ??
    fromCheckout(defaultId ? nodeMap[defaultId] : undefined) ??
    fromCheckout(
      Object.values(nodeMap).find((n) => n.type === "checkout" && n.content.productId === productId),
    )
  );
}

type TimelineItem =
  | { id: string; kind: "bot-text"; text: string; imageUrl?: string; linkUrl?: string }
  | { id: string; kind: "image-carousel"; imageUrls: string[]; linkUrl?: string; caption?: string }
  | { id: string; kind: "video"; url: string; aspectRatio?: string; caption?: string }
  | {
      id: string;
      kind: "coupon";
      imageUrl: string | null;
      message: string;
      discountLabel: string;
      code: string | null;
    }
  | { id: string; kind: "user-text"; text: string }
  | {
      id: string;
      kind: "choice";
      nodeId: string;
      text: string;
      options: ChoiceOption[];
      resolved: boolean;
    }
  | { id: string; kind: "product"; nodeId: string; productIds: string[]; resolved: boolean }
  | {
      id: string;
      kind: "faq-prompt";
      productId: string;
      resolved: boolean;
    }
  | {
      id: string;
      kind: "survey";
      nodeId: string;
      questions: SurveyQuestion[];
      resolved: boolean;
      answers?: Record<string, string>;
    }
  | {
      id: string;
      kind: "checkout";
      nodeId: string;
      productId: string;
      upsellProductId?: string;
      upsellImageUrl?: string;
      upsellComment?: string;
      crossSellProductId?: string;
      crossSellImageUrl?: string;
      crossSellComment?: string;
      sourceItemId?: string;
      completionItems?: GreetingItem[];
      termsText?: string;
      privacyText?: string;
    }
  | { id: string; kind: "checkout-result"; ok: boolean; items: GreetingItem[] }
  | { id: string; kind: "faq"; productId: string; nextNodeId?: string; proceeded?: boolean }
  | { id: string; kind: "business-calendar" };

let seq = 0;
function nextId() {
  seq += 1;
  return `item-${seq}`;
}

/** 「次に進むノード」が未設定の場合に自動で進む、表示順で1つ後ろのノードIDを返す。 */
function sequentialNextId(nodeId: string, orderedIds: string[]): string | undefined {
  const index = orderedIds.indexOf(nodeId);
  return index === -1 ? undefined : orderedIds[index + 1];
}

/** 選択肢分岐ノードで、実ノードの代わりに商品Q&Aをその場表示するためのsentinel値のprefix。 */
const QA_TARGET_PREFIX = "qa:";

export function ChatWidget({ scenarioSlug }: { scenarioSlug?: string } = {}) {
  const searchParams = useSearchParams();
  const previewScenarioId = searchParams.get("scenarioId");
  /** プレビュー表示かどうか(共有された非公開プレビューURLでも決済が実行されないようにする)。 */
  const isPreviewMode = searchParams.get("preview") === "1";
  const utmSource = searchParams.get("utm_source");
  const utmMedium = searchParams.get("utm_medium");
  const utmCampaign = searchParams.get("utm_campaign");
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [nodesById, setNodesById] = useState<Record<string, WidgetScenarioNode>>({});
  const [productsById, setProductsById] = useState<Record<string, WidgetProduct>>({});
  const [orderedNodeIds, setOrderedNodeIds] = useState<string[]>([]);
  const [menuItems, setMenuItems] = useState<WidgetMenuItem[]>([]);
  const [menuLayoutKey, setMenuLayoutKey] = useState<string>("row-3");
  const [menuImageUrl, setMenuImageUrl] = useState<string | null>(null);
  const [menuImageFailed, setMenuImageFailed] = useState(false);
  const [scenarioId, setScenarioId] = useState<string | undefined>(undefined);
  const [chatBackgroundColor, setChatBackgroundColor] = useState<string | null>(null);
  const [menuBackgroundColor, setMenuBackgroundColor] = useState<string | null>(null);
  const [menuTextColor, setMenuTextColor] = useState<"white" | "black" | null>(null);
  const [messageBackgroundColor, setMessageBackgroundColor] = useState<string | null>(null);
  const [messageTextColor, setMessageTextColor] = useState<"white" | "black" | null>(null);
  const [userMessageBackgroundColor, setUserMessageBackgroundColor] = useState<string | null>(null);
  const [userMessageTextColor, setUserMessageTextColor] = useState<"white" | "black" | null>(null);
  const [headerSettings, setHeaderSettings] = useState<{
    mode: "image" | "title" | null;
    imageUrl: string | null;
    title: string | null;
    backgroundColor: string | null;
    textColor: "white" | "black" | null;
  }>({ mode: null, imageUrl: null, title: null, backgroundColor: null, textColor: null });
  const [adTag, setAdTag] = useState<string | null>(null);
  const [conversionTag, setConversionTag] = useState<string | null>(null);
  const conversionFiredRef = useRef(false);
  // 決済リダイレクト復帰の判定effect(マウント時に一度だけ実行)から呼ばれても最新値を読めるようref化する
  const conversionTagRef = useRef<string | null>(null);
  useEffect(() => {
    conversionTagRef.current = conversionTag;
  }, [conversionTag]);
  const [couponCodeFieldEnabled, setCouponCodeFieldEnabled] = useState(true);
  /** クーポン表示ノードで使う、シナリオの自動適用クーポンの告知内容。advance()内から参照するためref化する。 */
  const couponRef = useRef<{
    code: string | null;
    name: string;
    discountType: "percent" | "fixed";
    discountValue: number;
    imageUrl: string | null;
    promoMessage: string | null;
    minOrderAmount: number | null;
    targetProductIds: string[] | null;
  } | null>(null);
  /** 商品(メイン)が一度でも選ばれたかどうか。クーポン対象商品提示は、これがまだfalseの間だけ表示する。 */
  const hasSelectedProductRef = useRef(false);
  // dangerouslySetInnerHTMLで挿入した<script>はブラウザ仕様により実行されないため、
  // 管理者が設定した広告計測タグ(GA4/Metaピクセル等)は要素を組み立て直してDOMに追加する
  useEffect(() => {
    if (!adTag) return;
    const container = document.createElement("div");
    container.innerHTML = adTag;
    const injected: ChildNode[] = [];
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "SCRIPT") {
        const original = node as HTMLScriptElement;
        const script = document.createElement("script");
        for (const attr of Array.from(original.attributes)) script.setAttribute(attr.name, attr.value);
        script.textContent = original.textContent;
        document.body.appendChild(script);
        injected.push(script);
      } else {
        document.body.appendChild(node);
        injected.push(node);
      }
    }
    return () => {
      for (const node of injected) node.parentNode?.removeChild(node);
    };
  }, [adTag]);
  /**
   * 注文完了時にのみ1回発火するコンバージョン計測タグ(Google広告のコンバージョンタグ等)。
   * iframeで埋め込まれている場合、iframe内で発火してもgclid等の広告クリック情報を持つ
   * 親ページの文脈では実行されないため正しく計測できない。そのため親ページへpostMessageし、
   * widget.js側で親ページの文脈でタグを実行してもらう。埋め込みでなければこの場で直接実行する。
   */
  function fireConversion(orderId: string, amount: number) {
    if (conversionFiredRef.current) return;
    conversionFiredRef.current = true;

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: "pm-chatbot", type: "conversion", orderId, amount }, "*");
      return;
    }
    const tag = conversionTagRef.current;
    if (!tag) {
      // 個別のコンバージョンタグ未設定時は、このページに設置済みの計測基盤へ標準の購入イベントを送る
      const w = window as unknown as {
        dataLayer?: { push: (v: unknown) => void };
        gtag?: (...args: unknown[]) => void;
        fbq?: (...args: unknown[]) => void;
      };
      w.dataLayer?.push({ event: "purchase", ecommerce: { transaction_id: orderId, value: amount, currency: "JPY" } });
      w.gtag?.("event", "purchase", { transaction_id: orderId, value: amount, currency: "JPY" });
      w.fbq?.("track", "Purchase", { value: amount, currency: "JPY" });
      return;
    }

    const filled = tag
      .split("{{amount}}").join(String(amount))
      .split("{{orderId}}").join(orderId);
    const container = document.createElement("div");
    container.innerHTML = filled;
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "SCRIPT") {
        const original = node as HTMLScriptElement;
        const script = document.createElement("script");
        for (const attr of Array.from(original.attributes)) script.setAttribute(attr.name, attr.value);
        script.textContent = original.textContent;
        document.body.appendChild(script);
      } else {
        document.body.appendChild(node);
      }
    }
  }
  // 入力欄フォーカス中(キーボード表示中)は固定メニューを隠し、スペースを確保する
  const [keyboardActive, setKeyboardActive] = useState(false);
  useEffect(() => {
    function isFormField(el: EventTarget | null): boolean {
      const tag = (el as HTMLElement | null)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }
    function handleFocusIn(e: FocusEvent) {
      if (isFormField(e.target)) setKeyboardActive(true);
    }
    function handleFocusOut(e: FocusEvent) {
      if (isFormField(e.target)) setKeyboardActive(false);
    }
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  // 高さは常にh-full(親のdvh)に任せる。以前はvisualViewport.heightをJSでheightに
  // 反映していたが、埋め込みiframe内でキーボード表示時に実際より小さい値が返ることがあり、
  // コンテナが縮んでその下に空白(親要素の背景)が見えてしまう不具合があったため廃止した。
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [checkoutMessages, setCheckoutMessages] = useState<{
    greetingItems?: GreetingItem[];
    completionItems?: GreetingItem[];
    privacyNotice?: string;
    termsText?: string;
    privacyText?: string;
    shoppingGuideText?: string;
  }>({});
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  // 注文完了後は、個人情報を含む過去のやり取り(アンケート等)を編集できないようにする
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [detailContext, setDetailContext] = useState<{
    item: Extract<TimelineItem, { kind: "product" }>;
    productId: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // PayPay等、決済確定にリダイレクトが必要な手段からの復帰を検知するための状態
  const [redirectStatus, setRedirectStatus] = useState<
    "checking" | "succeeded" | "processing" | "failed" | null
  >(() => (searchParams.get("payment_intent_client_secret") ? "checking" : null));

  useEffect(() => {
    const clientSecret = searchParams.get("payment_intent_client_secret");
    if (!clientSecret) return;
    let cancelled = false;
    loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").then((stripe) => {
      if (!stripe) return;
      stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
        if (cancelled) return;
        const status = paymentIntent?.status;
        setRedirectStatus(status === "succeeded" ? "succeeded" : status === "processing" ? "processing" : "failed");
        // PayPay等のリダイレクト決済は、Stripe.js(公開鍵)側にmetadataが返らないため、
        // 決済確定前にreturn_urlへ載せておいた注文情報をURLパラメータから読み取る
        const orderId = searchParams.get("pm_order_id");
        const amount = searchParams.get("pm_amount");
        if (status === "succeeded" && orderId && amount) {
          fireConversion(orderId, Number(amount));
        }
        // 再読み込みしても再度判定されないよう、決済関連のクエリパラメータをURLから除去する
        const url = new URL(window.location.href);
        url.searchParams.delete("payment_intent");
        url.searchParams.delete("payment_intent_client_secret");
        url.searchParams.delete("redirect_status");
        url.searchParams.delete("pm_order_id");
        url.searchParams.delete("pm_amount");
        window.history.replaceState({}, "", url.toString());
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 個人情報を含む注文完了画面が放置され続けないよう、完了から一定時間後に会話を最初のあいさつへ戻す。 */
  const RESET_AFTER_COMPLETE_MS = 3 * 60 * 1000;

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const scenarioUrl = previewScenarioId
      ? `/api/widget/scenario?id=${previewScenarioId}&preview=1`
      : scenarioSlug
        ? `/api/widget/scenario?slug=${encodeURIComponent(scenarioSlug)}`
        : "/api/widget/scenario";

    Promise.all([
      fetch("/api/widget/checkout-messages")
        .then((res) => res.json())
        .catch(
          () =>
            ({}) as {
              greetingItems?: GreetingItem[];
              completionItems?: GreetingItem[];
              privacyNotice?: string;
              termsText?: string;
              privacyText?: string;
              shoppingGuideText?: string;
            },
        ),
      fetch(scenarioUrl).then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "読み込みに失敗しました");
        return res.json() as Promise<{
          scenario?: {
            id: string;
            chat_background_color?: string | null;
            menu_background_color?: string | null;
            menu_text_color?: "white" | "black" | null;
            message_background_color?: string | null;
            message_text_color?: "white" | "black" | null;
            user_message_background_color?: string | null;
            user_message_text_color?: "white" | "black" | null;
            header_mode?: "image" | "title" | null;
            header_image_url?: string | null;
            header_title?: string | null;
            header_background_color?: string | null;
            header_text_color?: "white" | "black" | null;
            ad_tag?: string | null;
            conversion_tag?: string | null;
            coupon_code_field_enabled?: boolean;
            menu_layout_key?: string | null;
            menu_image_url?: string | null;
          };
          nodes: WidgetScenarioNode[];
          products: WidgetProduct[];
          menuItems?: WidgetMenuItem[];
          coupon?: {
            code: string | null;
            name: string;
            discount_type: "percent" | "fixed";
            discount_value: number;
            image_url: string | null;
            promo_message: string | null;
            min_order_amount: number | null;
            target_product_ids: string[] | null;
          } | null;
        }>;
      }),
    ])
      .then(([messagesBody, scenarioBody]) => {
        setCheckoutMessages(messagesBody);

        const nodeMap: Record<string, WidgetScenarioNode> = {};
        for (const node of scenarioBody.nodes) nodeMap[node.id] = node;
        const productMap: Record<string, WidgetProduct> = {};
        for (const product of scenarioBody.products) productMap[product.id] = product;
        // 表示順(display_order)に並んだノードID一覧。次のノードが未設定の場合、この順で自動的に進む
        const orderedIds = scenarioBody.nodes.map((n) => n.id);

        setNodesById(nodeMap);
        setProductsById(productMap);
        setOrderedNodeIds(orderedIds);
        setMenuItems(scenarioBody.menuItems ?? []);
        setMenuLayoutKey(scenarioBody.scenario?.menu_layout_key ?? "row-3");
        setMenuImageUrl(scenarioBody.scenario?.menu_image_url ?? null);
        setMenuImageFailed(false);
        setScenarioId(scenarioBody.scenario?.id);
        setAdTag(scenarioBody.scenario?.ad_tag ?? null);
        setConversionTag(scenarioBody.scenario?.conversion_tag ?? null);
        setCouponCodeFieldEnabled(scenarioBody.scenario?.coupon_code_field_enabled ?? true);
        couponRef.current = scenarioBody.coupon
          ? {
              code: scenarioBody.coupon.code,
              name: scenarioBody.coupon.name,
              discountType: scenarioBody.coupon.discount_type,
              discountValue: scenarioBody.coupon.discount_value,
              imageUrl: scenarioBody.coupon.image_url,
              promoMessage: scenarioBody.coupon.promo_message,
              minOrderAmount: scenarioBody.coupon.min_order_amount,
              targetProductIds: scenarioBody.coupon.target_product_ids,
            }
          : null;
        fetch("/api/widget/access-log", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(scenarioBody.scenario?.id && { scenarioId: scenarioBody.scenario.id }),
            sessionId,
            utmSource,
            utmMedium,
            utmCampaign,
            referrer: document.referrer || null,
          }),
        }).catch(() => {});
        setChatBackgroundColor(scenarioBody.scenario?.chat_background_color ?? null);
        setMenuBackgroundColor(scenarioBody.scenario?.menu_background_color ?? null);
        setMenuTextColor(scenarioBody.scenario?.menu_text_color ?? null);
        setMessageBackgroundColor(scenarioBody.scenario?.message_background_color ?? null);
        setMessageTextColor(scenarioBody.scenario?.message_text_color ?? null);
        setUserMessageBackgroundColor(scenarioBody.scenario?.user_message_background_color ?? null);
        setUserMessageTextColor(scenarioBody.scenario?.user_message_text_color ?? null);
        setHeaderSettings({
          mode: scenarioBody.scenario?.header_mode ?? null,
          imageUrl: scenarioBody.scenario?.header_image_url ?? null,
          title: scenarioBody.scenario?.header_title ?? null,
          backgroundColor: scenarioBody.scenario?.header_background_color ?? null,
          textColor: scenarioBody.scenario?.header_text_color ?? null,
        });

        // 決済フォーム設定の「あいさつ文」(最大5項目)と、その直後の個人情報利用に関する注意文を、
        // 商品選択より前に会話冒頭で1度だけ表示する
        for (const greetingItem of messagesBody.greetingItems ?? []) {
          setTimeline((prev) => [
            ...prev,
            {
              id: nextId(),
              kind: "bot-text",
              text: greetingItem.type === "text" ? greetingItem.text ?? "" : "",
              imageUrl: greetingItem.type === "image" ? greetingItem.imageUrl : undefined,
              linkUrl: greetingItem.type === "image" ? greetingItem.linkUrl : undefined,
            },
          ]);
        }
        if (messagesBody.privacyNotice) {
          setTimeline((prev) => [
            ...prev,
            { id: nextId(), kind: "bot-text", text: messagesBody.privacyNotice ?? "" },
          ]);
        }

        const entry = scenarioBody.nodes[0];
        if (entry) advance(entry.id, nodeMap, productMap, undefined, orderedIds);
      })
      .catch((err) => setLoadError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/widget/business-closed-dates")
      .then((res) => res.json())
      .then((body: { closedDates?: string[] }) => setClosedDates(new Set(body.closedDates ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [timeline]);

  function advance(
    nodeId: string,
    nodeMap: Record<string, WidgetScenarioNode> = nodesById,
    productMap: Record<string, WidgetProduct> = productsById,
    sourceItemId?: string,
    orderedIds: string[] = orderedNodeIds,
    /** 直前に顧客が選んだ商品(ある場合)。到達したcheckoutノード自身の候補に含まれていれば、それを優先する。 */
    selectedProductId?: string,
    /** 選んだ商品ノード側で設定された、その商品専用のアップセル・クロスセル(ある場合、checkoutノード自身の設定より優先)。 */
    selectedProductUpsell?: ProductUpsellEntry,
  ) {
    const node = nodeMap[nodeId];
    if (!node) return;

    const content = node.content as {
      text?: string;
      imageUrl?: string;
      imageUrls?: string[];
      videoUrl?: string;
      aspectRatio?: string;
      linkUrl?: string;
      caption?: string;
      productId?: string;
      productIds?: string[];
      options?: ChoiceOption[];
      questions?: SurveyQuestion[];
      introText?: string;
      upsellProductId?: string;
      upsellImageUrl?: string;
      upsellComment?: string;
      crossSellProductId?: string;
      crossSellImageUrl?: string;
      crossSellComment?: string;
      showTargetProducts?: boolean;
    };

    switch (node.type) {
      case "message": {
        setTimeline((prev) => [
          ...prev,
          { id: nextId(), kind: "bot-text", text: content.text ?? "", imageUrl: content.imageUrl },
        ]);
        const next = node.next_node_map.default ?? sequentialNextId(node.id, orderedIds);
        if (next)
          setTimeout(
            () =>
              advance(
                next,
                nodeMap,
                productMap,
                sourceItemId,
                orderedIds,
                selectedProductId,
                selectedProductUpsell,
              ),
            300,
          );
        break;
      }
      case "image": {
        const urls = content.imageUrls ?? (content.imageUrl ? [content.imageUrl] : []);
        if (urls.length > 1) {
          setTimeline((prev) => [
            ...prev,
            {
              id: nextId(),
              kind: "image-carousel",
              imageUrls: urls,
              linkUrl: content.linkUrl,
              caption: content.caption,
            },
          ]);
        } else {
          setTimeline((prev) => [
            ...prev,
            {
              id: nextId(),
              kind: "bot-text",
              text: content.caption ?? "",
              imageUrl: urls[0],
              linkUrl: content.linkUrl,
            },
          ]);
        }
        const next = node.next_node_map.default ?? sequentialNextId(node.id, orderedIds);
        if (next)
          setTimeout(
            () =>
              advance(
                next,
                nodeMap,
                productMap,
                sourceItemId,
                orderedIds,
                selectedProductId,
                selectedProductUpsell,
              ),
            300,
          );
        break;
      }
      case "video": {
        if (content.videoUrl) {
          setTimeline((prev) => [
            ...prev,
            {
              id: nextId(),
              kind: "video",
              url: content.videoUrl!,
              aspectRatio: content.aspectRatio,
              caption: content.caption,
            },
          ]);
        }
        const next = node.next_node_map.default ?? sequentialNextId(node.id, orderedIds);
        if (next)
          setTimeout(
            () =>
              advance(
                next,
                nodeMap,
                productMap,
                sourceItemId,
                orderedIds,
                selectedProductId,
                selectedProductUpsell,
              ),
            300,
          );
        break;
      }
      case "coupon": {
        const active = couponRef.current;
        if (active) {
          const discountLabel =
            active.discountType === "percent" ? `${active.discountValue}%OFF` : `${active.discountValue}円引き`;
          setTimeline((prev) => [
            ...prev,
            {
              id: nextId(),
              kind: "coupon",
              imageUrl: active.imageUrl,
              message: active.promoMessage || "お得なクーポンがあります",
              discountLabel,
              code: active.code,
            },
          ]);
        }

        // クーポン対象商品提示: すでに商品が選ばれている場合は表示せず、クーポンのお知らせのみ流す。
        const showTargetProducts = Boolean(content.showTargetProducts);
        const eligibleProductIds =
          showTargetProducts && active && !hasSelectedProductRef.current
            ? computeCouponEligibleProductIds(active, productMap, nodeMap)
            : [];

        if (eligibleProductIds.length > 0) {
          setTimeout(() => {
            setTimeline((prev) => [
              ...prev,
              { id: nextId(), kind: "product", nodeId: node.id, productIds: eligibleProductIds, resolved: false },
            ]);
          }, 300);
          // 通常の商品提示ノードと同様、商品が選ばれるまではここで止まる(自動で次には進まない)
          break;
        }

        const next = node.next_node_map.default ?? sequentialNextId(node.id, orderedIds);
        if (next)
          setTimeout(
            () =>
              advance(
                next,
                nodeMap,
                productMap,
                sourceItemId,
                orderedIds,
                selectedProductId,
                selectedProductUpsell,
              ),
            300,
          );
        break;
      }
      case "choice": {
        setTimeline((prev) => [
          ...prev,
          {
            id: nextId(),
            kind: "choice",
            nodeId: node.id,
            text: content.text ?? "",
            options: content.options ?? [],
            resolved: false,
          },
        ]);
        break;
      }
      case "survey": {
        if (content.introText) {
          setTimeline((prev) => [...prev, { id: nextId(), kind: "bot-text", text: content.introText ?? "" }]);
        }
        setTimeline((prev) => [
          ...prev,
          {
            id: nextId(),
            kind: "survey",
            nodeId: node.id,
            questions: content.questions ?? [],
            resolved: false,
          },
        ]);
        break;
      }
      case "product":
      case "checkout": {
        const productIds = Array.isArray(content.productIds)
          ? content.productIds
          : content.productId
            ? [content.productId]
            : [];
        const validIds = productIds.filter((id) => productMap[id]);

        if (validIds.length === 0) {
          setTimeline((prev) => [
            ...prev,
            { id: nextId(), kind: "bot-text", text: "商品情報の読み込みに失敗しました。" },
          ]);
          break;
        }

        if (node.type === "checkout") {
          // 直前に顧客が選んだ商品が、このcheckoutノード自身の候補に含まれていればそれを優先する
          // (複数商品を1つの決済導線ノードで共有している場合、選んだ商品と違うものがカートインする不具合を防ぐ)。
          const checkoutProductId =
            selectedProductId && validIds.includes(selectedProductId) ? selectedProductId : validIds[0];
          // 選んだ商品自身に専用のアップセル・クロスセル設定があれば、checkoutノード自身の設定より優先する
          // (未設定の項目も含めて丸ごと置き換える。「この商品にはクロスセルなし」を明示できるようにするため)。
          const upsellOverride =
            selectedProductId && checkoutProductId === selectedProductId ? selectedProductUpsell : undefined;
          const upsellProductId = upsellOverride
            ? upsellOverride.upsellProductId
            : content.upsellProductId;
          const crossSellProductId = upsellOverride
            ? upsellOverride.crossSellProductId
            : content.crossSellProductId;
          hasSelectedProductRef.current = true;
          setTimeline((prev) => [
            // 決済導線は同時に1つだけ有効にする(未完了のまま残っている決済フォームは
            // 新しい注文を始めた時点で無効化する)
            ...prev.filter((i) => i.kind !== "checkout"),
            {
              id: nextId(),
              kind: "checkout",
              nodeId: node.id,
              productId: checkoutProductId,
              upsellProductId: upsellProductId && productMap[upsellProductId] ? upsellProductId : undefined,
              upsellImageUrl: upsellOverride ? upsellOverride.upsellImageUrl : content.upsellImageUrl,
              upsellComment: upsellOverride ? upsellOverride.upsellComment : content.upsellComment,
              crossSellProductId:
                crossSellProductId && productMap[crossSellProductId] ? crossSellProductId : undefined,
              crossSellImageUrl: upsellOverride ? upsellOverride.crossSellImageUrl : content.crossSellImageUrl,
              crossSellComment: upsellOverride ? upsellOverride.crossSellComment : content.crossSellComment,
              sourceItemId,
              completionItems: checkoutMessages.completionItems,
              termsText: checkoutMessages.termsText,
              privacyText: checkoutMessages.privacyText,
            },
          ]);
          break;
        }

        setTimeline((prev) => [
          ...prev,
          { id: nextId(), kind: "product", nodeId: node.id, productIds: validIds, resolved: false },
        ]);

        // 単一商品の場合のみ、任意でチャット内から商品QAに進めるボタンを表示する
        if (validIds.length === 1) {
          setTimeout(() => {
            setTimeline((prev) => [
              ...prev,
              { id: nextId(), kind: "faq-prompt", productId: validIds[0], resolved: false },
            ]);
          }, 300);
        }
        break;
      }
      case "product_qa": {
        const productId = content.productId;
        if (!productId) {
          setTimeline((prev) => [
            ...prev,
            { id: nextId(), kind: "bot-text", text: "対象の商品が見つかりませんでした。" },
          ]);
          break;
        }
        const faqNextNodeId = node.next_node_map.default ?? sequentialNextId(node.id, orderedIds);
        setTimeline((prev) => [...prev, { id: nextId(), kind: "faq", productId, nextNodeId: faqNextNodeId }]);
        break;
      }
      default:
        break;
    }
  }

  function resetConversation() {
    setTimeline([]);
    setSurveyAnswers({});
    setDetailContext(null);
    setLoadError(null);
    setSessionId(crypto.randomUUID());
    setOrderConfirmed(false);

    for (const greetingItem of checkoutMessages.greetingItems ?? []) {
      setTimeline((prev) => [
        ...prev,
        {
          id: nextId(),
          kind: "bot-text",
          text: greetingItem.type === "text" ? greetingItem.text ?? "" : "",
          imageUrl: greetingItem.type === "image" ? greetingItem.imageUrl : undefined,
          linkUrl: greetingItem.type === "image" ? greetingItem.linkUrl : undefined,
        },
      ]);
    }
    if (checkoutMessages.privacyNotice) {
      setTimeline((prev) => [
        ...prev,
        { id: nextId(), kind: "bot-text", text: checkoutMessages.privacyNotice ?? "" },
      ]);
    }

    const entry = nodesById[orderedNodeIds[0]];
    if (entry) advance(entry.id);
  }

  /** 常時表示の固定メニュー(会社概要・今すぐ買う・SNS等)のボタン押下を処理する。 */
  function handleMenuItemClick(item: WidgetMenuItem) {
    if (item.action_type === "url") {
      if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (item.action_type === "business_calendar") {
      setTimeline((prev) => [...prev, { id: nextId(), kind: "business-calendar" }]);
      return;
    }
    if (item.action_type === "shopping_guide") {
      setTimeline((prev) => [
        ...prev,
        {
          id: nextId(),
          kind: "bot-text",
          text: checkoutMessages.shoppingGuideText || "お買い物ガイドは準備中です。",
        },
      ]);
      return;
    }
    if (item.target_node_id) advance(item.target_node_id);
  }

  function handleChoiceSelect(item: Extract<TimelineItem, { kind: "choice" }>, option: ChoiceOption) {
    setTimeline((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, resolved: true } : i)),
    );
    setTimeline((prev) => [...prev, { id: nextId(), kind: "user-text", text: option.label }]);

    const node = nodesById[item.nodeId];
    const next =
      node?.next_node_map[option.value] ??
      node?.next_node_map.default ??
      (node && sequentialNextId(node.id, orderedNodeIds));
    if (!next) return;

    if (next.startsWith(QA_TARGET_PREFIX)) {
      const [productId, encodedNextNodeId] = next.slice(QA_TARGET_PREFIX.length).split("|");
      const faqNextNodeId =
        encodedNextNodeId || node?.next_node_map.default || (node && sequentialNextId(node.id, orderedNodeIds));
      setTimeline((prev) => [
        ...prev,
        { id: nextId(), kind: "faq", productId, nextNodeId: faqNextNodeId || undefined },
      ]);
      return;
    }
    advance(next, nodesById, productsById, item.id);
  }

  /**
   * Q&Aの「購入へ進む」。他のメッセージと同様にスレッドに残したまま、次のノードへ進む
   * (Q&Aは購入へ進んだ後もスクロールして操作できる)。
   */
  function handleFaqProceed(item: Extract<TimelineItem, { kind: "faq" }>) {
    setTimeline((prev) => prev.map((i) => (i.id === item.id ? { ...i, proceeded: true } : i)));
    if (item.nextNodeId) {
      advance(item.nextNodeId, nodesById, productsById, undefined, orderedNodeIds, item.productId);
    }
  }

  function handleProductSelect(item: Extract<TimelineItem, { kind: "product" }>, productId: string) {
    setTimeline((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: true } : i)));
    hasSelectedProductRef.current = true;

    const node = nodesById[item.nodeId];
    const productUpsell = resolveProductUpsell(node, productId, nodesById);

    // プレビューではアップセル・クロスセルが出ない理由が分からないと設定を確認しづらいため、
    // 「未設定」と「設定はあるが商品を解決できない」を区別して知らせる(本番では表示しない)。
    if (isPreviewMode) {
      const unresolved = [
        productUpsell?.upsellProductId && !productsById[productUpsell.upsellProductId]
          ? "アップセル"
          : null,
        productUpsell?.crossSellProductId && !productsById[productUpsell.crossSellProductId]
          ? "クロスセル"
          : null,
      ].filter(Boolean);
      const notice = !productUpsell?.upsellProductId && !productUpsell?.crossSellProductId
        ? "プレビュー: この商品にはアップセル・クロスセルが設定されていません(商品提示ノードのマトリクスで設定してください)。"
        : unresolved.length > 0
          ? `プレビュー: ${unresolved.join("・")}に設定された商品が見つかりませんでした(商品が削除されている可能性があります)。`
          : null;
      if (notice) {
        setTimeline((prev) => [...prev, { id: nextId(), kind: "bot-text", text: notice }]);
      }
    }

    const next = node?.next_node_map[productId] ?? node?.next_node_map.default;
    if (next && nodesById[next]?.type === "checkout") {
      advance(next, nodesById, productsById, item.id, orderedNodeIds, productId, productUpsell);
    } else {
      // シナリオ側で決済導線への接続が未設定でも購入導線を提供する
      setTimeline((prev) => [
        // 決済導線は同時に1つだけ有効にする(未完了のまま残っている決済フォームは
        // 新しい注文を始めた時点で無効化する)
        ...prev.filter((i) => i.kind !== "checkout"),
        {
          id: nextId(),
          kind: "checkout",
          nodeId: item.nodeId,
          productId,
          upsellProductId:
            productUpsell?.upsellProductId && productsById[productUpsell.upsellProductId]
              ? productUpsell.upsellProductId
              : undefined,
          upsellImageUrl: productUpsell?.upsellImageUrl,
          upsellComment: productUpsell?.upsellComment,
          crossSellProductId:
            productUpsell?.crossSellProductId && productsById[productUpsell.crossSellProductId]
              ? productUpsell.crossSellProductId
              : undefined,
          crossSellImageUrl: productUpsell?.crossSellImageUrl,
          crossSellComment: productUpsell?.crossSellComment,
          sourceItemId: item.id,
          completionItems: checkoutMessages.completionItems,
          termsText: checkoutMessages.termsText,
          privacyText: checkoutMessages.privacyText,
        },
      ]);
    }
  }

  function handleFaqPromptSelect(item: Extract<TimelineItem, { kind: "faq-prompt" }>) {
    setTimeline((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: true } : i)));
    setTimeline((prev) => [...prev, { id: nextId(), kind: "faq", productId: item.productId }]);
  }

  /** アンケート回答は注文が完了しなくても見込み客情報として残るよう、その都度leadsへ保存する。 */
  function persistSurveyAnswers(merged: Record<string, string>) {
    if (Object.keys(merged).length === 0) return;
    fetch("/api/widget/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, surveyResponses: merged, ...(scenarioId && { scenarioId }) }),
    }).catch(() => {});
  }

  function handleSurveySubmit(item: Extract<TimelineItem, { kind: "survey" }>, answers: Record<string, string>) {
    setTimeline((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: true, answers } : i)));
    const merged = { ...surveyAnswers, ...answers };
    setSurveyAnswers(merged);
    persistSurveyAnswers(merged);

    const node = nodesById[item.nodeId];
    const next = node?.next_node_map.default ?? (node && sequentialNextId(node.id, orderedNodeIds));
    if (next) advance(next, nodesById, productsById, item.id);
  }

  function handleSurveySkip(
    item: Extract<TimelineItem, { kind: "survey" }>,
    partialAnswers: Record<string, string>,
  ) {
    setTimeline((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, resolved: true, answers: partialAnswers } : i)),
    );
    if (Object.keys(partialAnswers).length > 0) {
      const merged = { ...surveyAnswers, ...partialAnswers };
      setSurveyAnswers(merged);
      persistSurveyAnswers(merged);
    }

    const node = nodesById[item.nodeId];
    const next = node?.next_node_map.default ?? (node && sequentialNextId(node.id, orderedNodeIds));
    if (next) advance(next, nodesById, productsById, item.id);
  }

  /** 注文完了前であれば、回答済みのアンケートをスレッドを遡って編集できるようにする。 */
  function handleSurveyEdit(item: Extract<TimelineItem, { kind: "survey" }>) {
    if (orderConfirmed) return;
    setTimeline((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: false } : i)));
  }

  function handleCheckoutBack(item: Extract<TimelineItem, { kind: "checkout" }>) {
    setTimeline((prev) =>
      prev
        .filter((i) => i.id !== item.id)
        .map((i) => {
          if (i.id === item.sourceItemId && (i.kind === "product" || i.kind === "choice")) {
            return { ...i, resolved: false };
          }
          return i;
        }),
    );
  }

  function handleCheckoutComplete(
    item: Extract<TimelineItem, { kind: "checkout" }>,
    result: { ok: boolean; items: GreetingItem[]; order?: { orderId: string; amount: number } },
  ) {
    setTimeline((prev) => [
      ...prev.filter((i) => i.id !== item.id),
      { id: nextId(), kind: "checkout-result", ok: result.ok, items: result.items },
    ]);
    if (result.ok) {
      setOrderConfirmed(true);
      if (result.order) fireConversion(result.order.orderId, result.order.amount);
    }

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(resetConversation, RESET_AFTER_COMPLETE_MS);
  }

  const detailProduct = detailContext ? productsById[detailContext.productId] : null;

  if (redirectStatus === "checking") {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-yellow-50 p-6 text-center text-sm text-neutral-500">
        決済結果を確認しています…
      </div>
    );
  }

  if (redirectStatus) {
    const messages: Record<Exclude<typeof redirectStatus, "checking">, { text: string; className: string }> = {
      succeeded: { text: "お支払いが完了しました。ありがとうございます。", className: "text-green-700" },
      processing: { text: "お支払いを処理しています。しばらくお待ちください。", className: "text-neutral-600" },
      failed: {
        text: "お支払いを完了できませんでした。恐れ入りますが再度お試しください。",
        className: "text-red-700",
      },
    };
    const { text, className } = messages[redirectStatus];
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-4 bg-yellow-50 p-6 text-center">
        <p className={`text-sm ${className}`}>{text}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          閉じる
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-full flex-col ${chatBackgroundColor ? "" : "bg-yellow-50"}`}
      style={{
        ...(chatBackgroundColor && { backgroundColor: chatBackgroundColor }),
        ...(messageBackgroundColor && { "--message-bg": messageBackgroundColor }),
        ...(userMessageBackgroundColor && { "--user-message-bg": userMessageBackgroundColor }),
        "--message-fg": effectiveTextColor(messageBackgroundColor ?? "#F5F5F4", messageTextColor),
        "--user-message-fg": effectiveTextColor(userMessageBackgroundColor ?? "#171717", userMessageTextColor),
      } as CSSProperties}
    >
      {isPreviewMode && (
        <div className="shrink-0 bg-amber-500 py-1 text-center text-xs font-semibold text-white">
          プレビューモード(実際の決済・注文データは作成されません)
        </div>
      )}
      {headerSettings.mode === "image" && headerSettings.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={headerSettings.imageUrl} alt="" className="w-full shrink-0 object-cover" />
      )}
      {headerSettings.mode === "title" && (
        <div
          className={`shrink-0 p-3 text-center text-sm font-medium ${
            headerSettings.backgroundColor ? "" : "bg-white"
          }`}
          style={{
            ...(headerSettings.backgroundColor && { backgroundColor: headerSettings.backgroundColor }),
            color: effectiveTextColor(headerSettings.backgroundColor, headerSettings.textColor),
          }}
        >
          {headerSettings.title}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {loadError && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-700">{loadError}</p>
        )}
        {timeline.map((item) => {
          switch (item.kind) {
            case "bot-text":
              return (
                <MessageBubble
                  key={item.id}
                  message={{
                    id: item.id,
                    from: "bot",
                    kind: "text",
                    text: item.text,
                    imageUrl: item.imageUrl,
                    linkUrl: item.linkUrl,
                  }}
                />
              );
            case "image-carousel":
              return (
                <ImageCarousel
                  key={item.id}
                  imageUrls={item.imageUrls}
                  linkUrl={item.linkUrl}
                  caption={item.caption}
                />
              );
            case "video":
              return (
                <VideoPlayer key={item.id} url={item.url} aspectRatio={item.aspectRatio} caption={item.caption} />
              );
            case "coupon":
              return (
                <CouponCard
                  key={item.id}
                  imageUrl={item.imageUrl}
                  message={item.message}
                  discountLabel={item.discountLabel}
                  code={item.code}
                />
              );
            case "user-text":
              return <MessageBubble key={item.id} message={{ id: item.id, from: "user", kind: "text", text: item.text }} />;
            case "choice":
              return (
                <div key={item.id} className="space-y-2">
                  <MessageBubble message={{ id: item.id, from: "bot", kind: "text", text: item.text }} />
                  {!item.resolved && (
                    <ChoiceButtons options={item.options} onSelect={(o) => handleChoiceSelect(item, o)} />
                  )}
                </div>
              );
            case "product": {
              const products = item.productIds.map((id) => productsById[id]).filter(Boolean);
              if (products.length === 0) return null;
              return (
                <ProductCarousel
                  key={item.id}
                  products={products}
                  onSelect={item.resolved ? undefined : (productId) => handleProductSelect(item, productId)}
                  onViewDetail={(productId) => setDetailContext({ item, productId })}
                />
              );
            }
            case "faq-prompt":
              return item.resolved ? null : (
                <ChoiceButtons
                  key={item.id}
                  options={[{ label: "この商品について質問する", value: "faq" }]}
                  onSelect={() => handleFaqPromptSelect(item)}
                />
              );
            case "survey":
              return item.resolved ? (
                <div
                  key={item.id}
                  className="max-w-[85%] space-y-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-neutral-700">アンケート回答</span>
                    {!orderConfirmed && (
                      <button
                        type="button"
                        onClick={() => handleSurveyEdit(item)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        編集する
                      </button>
                    )}
                  </div>
                  {item.answers && Object.keys(item.answers).length > 0 ? (
                    <div className="space-y-1 text-neutral-600">
                      {Object.entries(item.answers).map(([q, a]) => (
                        <div key={q}>
                          <p className="text-xs text-neutral-400">{q}</p>
                          <p>{a}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-neutral-400">未回答のままスキップしました</p>
                  )}
                </div>
              ) : (
                <SurveyForm
                  key={item.id}
                  questions={item.questions}
                  initialAnswers={item.answers}
                  onSubmit={(answers) => handleSurveySubmit(item, answers)}
                  onSkip={(partialAnswers) => handleSurveySkip(item, partialAnswers)}
                />
              );
            case "checkout": {
              const product = productsById[item.productId];
              if (!product) return null;
              const sourceItem = item.sourceItemId
                ? timeline.find((i) => i.id === item.sourceItemId)
                : undefined;
              const alternativeProducts =
                sourceItem && sourceItem.kind === "product"
                  ? sourceItem.productIds.map((id) => productsById[id]).filter(Boolean)
                  : undefined;
              return (
                <CheckoutForm
                  key={item.id}
                  product={product}
                  alternativeProducts={alternativeProducts}
                  upsellProduct={item.upsellProductId ? productsById[item.upsellProductId] : undefined}
                  upsellImageUrl={item.upsellImageUrl}
                  upsellComment={item.upsellComment}
                  crossSellProduct={
                    item.crossSellProductId ? productsById[item.crossSellProductId] : undefined
                  }
                  crossSellImageUrl={item.crossSellImageUrl}
                  crossSellComment={item.crossSellComment}
                  completionItems={item.completionItems}
                  termsText={item.termsText}
                  privacyText={item.privacyText}
                  sessionId={sessionId}
                  scenarioId={scenarioId}
                  utmSource={utmSource}
                  utmMedium={utmMedium}
                  utmCampaign={utmCampaign}
                  couponCodeFieldEnabled={couponCodeFieldEnabled}
                  surveyResponses={surveyAnswers}
                  previewMode={isPreviewMode}
                  onComplete={(result) => handleCheckoutComplete(item, result)}
                  onBack={() => handleCheckoutBack(item)}
                />
              );
            }
            case "faq":
              return (
                <FaqPanel
                  key={item.id}
                  productId={item.productId}
                  productName={productsById[item.productId]?.name}
                  scenarioId={scenarioId}
                  onProceed={item.nextNodeId && !item.proceeded ? () => handleFaqProceed(item) : undefined}
                />
              );
            case "business-calendar":
              return <BusinessCalendarView key={item.id} closedDates={closedDates} />;
            case "checkout-result":
              return (
                <div key={item.id} className="max-w-[85%] space-y-2">
                  {item.items.map((resultItem, idx) => (
                    <div
                      key={idx}
                      className={`overflow-hidden rounded-lg text-sm ${
                        item.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {resultItem.type === "image" && resultItem.imageUrl && (
                        <>
                          {resultItem.linkUrl ? (
                            <a href={resultItem.linkUrl} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={resultItem.imageUrl} alt="" className="block h-auto w-full object-cover" />
                            </a>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={resultItem.imageUrl} alt="" className="block h-auto w-full object-cover" />
                          )}
                        </>
                      )}
                      {resultItem.type === "text" && resultItem.text && (
                        <div className="p-3">{resultItem.text}</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            default:
              return null;
          }
        })}
      </div>

      {!keyboardActive &&
        ((menuImageUrl && !menuImageFailed) || menuItems.length > 0) &&
        (() => {
          const layout = getMenuLayout(menuLayoutKey);
          const cellItems = menuItems.slice(0, layout.cells.length);
          // 画像モード(menuImageUrlが設定されている場合)はテキストボタンより優先して表示する。
          // ただし画像の読み込みに失敗した場合(URL誤り等)は、空白/壊れた画像アイコンが
          // 表示されたままにならないよう、テキストボタン表示にフォールバックする。
          if (menuImageUrl && !menuImageFailed) {
            return (
              <div className="relative shrink-0 border-t border-neutral-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={menuImageUrl}
                  alt="固定メニュー"
                  className="block h-auto w-full"
                  onError={() => setMenuImageFailed(true)}
                />
                {cellItems.length > 0 && (
                  <div
                    className="absolute inset-0 grid"
                    style={{
                      gridTemplateColumns: menuGridTemplateColumns(layout),
                      gridTemplateRows: menuGridTemplateRows(layout),
                    }}
                  >
                    {cellItems.map((item, index) => {
                      const cell = layout.cells[index];
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-label={item.label}
                          onClick={() => handleMenuItemClick(item)}
                          className="opacity-0"
                          style={{ gridColumn: menuCellGridColumn(cell), gridRow: menuCellGridRow(cell) }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          if (cellItems.length === 0) return null;
          return (
            <div
              className={`grid shrink-0 border-t border-neutral-200 ${menuBackgroundColor ? "" : "bg-white"}`}
              style={{
                gridTemplateColumns: menuGridTemplateColumns(layout),
                gridTemplateRows: menuGridTemplateRows(layout),
                ...(menuBackgroundColor && { backgroundColor: menuBackgroundColor }),
                color: effectiveTextColor(menuBackgroundColor, menuTextColor),
              }}
            >
              {cellItems.map((item, index) => {
                const cell = layout.cells[index];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleMenuItemClick(item)}
                    className={`flex items-center justify-center border border-neutral-100 px-2 text-center hover:bg-black/5 ${
                      layout.rows === 2 ? "py-1.5 text-[10px]" : "py-3 text-xs"
                    }`}
                    style={{ gridColumn: menuCellGridColumn(cell), gridRow: menuCellGridRow(cell) }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          );
        })()}

      {detailContext && detailProduct && (
        <ProductDetailPanel
          product={detailProduct}
          onClose={() => setDetailContext(null)}
          onSelect={
            detailContext.item.resolved
              ? undefined
              : () => {
                  const { item, productId } = detailContext;
                  setDetailContext(null);
                  handleProductSelect(item, productId);
                }
          }
        />
      )}
    </div>
  );
}
