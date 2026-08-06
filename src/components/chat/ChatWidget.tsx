"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { ImageCarousel } from "@/components/chat/ImageCarousel";

interface GreetingItem {
  type: "image" | "text";
  imageUrl?: string;
  linkUrl?: string;
  text?: string;
}

type TimelineItem =
  | { id: string; kind: "bot-text"; text: string; imageUrl?: string; linkUrl?: string }
  | { id: string; kind: "image-carousel"; imageUrls: string[]; linkUrl?: string; caption?: string }
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
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [nodesById, setNodesById] = useState<Record<string, WidgetScenarioNode>>({});
  const [productsById, setProductsById] = useState<Record<string, WidgetProduct>>({});
  const [orderedNodeIds, setOrderedNodeIds] = useState<string[]>([]);
  const [menuItems, setMenuItems] = useState<WidgetMenuItem[]>([]);
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
          nodes: WidgetScenarioNode[];
          products: WidgetProduct[];
          menuItems?: WidgetMenuItem[];
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

        const entry = scenarioBody.nodes.find((n) => n.is_entry) ?? scenarioBody.nodes[0];
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
  ) {
    const node = nodeMap[nodeId];
    if (!node) return;

    const content = node.content as {
      text?: string;
      imageUrl?: string;
      imageUrls?: string[];
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
    };

    switch (node.type) {
      case "message": {
        setTimeline((prev) => [
          ...prev,
          { id: nextId(), kind: "bot-text", text: content.text ?? "", imageUrl: content.imageUrl },
        ]);
        const next = node.next_node_map.default ?? sequentialNextId(node.id, orderedIds);
        if (next) setTimeout(() => advance(next, nodeMap, productMap, sourceItemId, orderedIds), 300);
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
        if (next) setTimeout(() => advance(next, nodeMap, productMap, sourceItemId, orderedIds), 300);
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
          setTimeline((prev) => [
            // 決済導線は同時に1つだけ有効にする(未完了のまま残っている決済フォームは
            // 新しい注文を始めた時点で無効化する)
            ...prev.filter((i) => i.kind !== "checkout"),
            {
              id: nextId(),
              kind: "checkout",
              nodeId: node.id,
              productId: validIds[0],
              upsellProductId:
                content.upsellProductId && productMap[content.upsellProductId]
                  ? content.upsellProductId
                  : undefined,
              upsellImageUrl: content.upsellImageUrl,
              upsellComment: content.upsellComment,
              crossSellProductId:
                content.crossSellProductId && productMap[content.crossSellProductId]
                  ? content.crossSellProductId
                  : undefined,
              crossSellImageUrl: content.crossSellImageUrl,
              crossSellComment: content.crossSellComment,
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

    const entry = Object.values(nodesById).find((n) => n.is_entry) ?? nodesById[orderedNodeIds[0]];
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
    if (item.nextNodeId) advance(item.nextNodeId, nodesById, productsById);
  }

  function handleProductSelect(item: Extract<TimelineItem, { kind: "product" }>, productId: string) {
    setTimeline((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: true } : i)));

    const node = nodesById[item.nodeId];
    const next = node?.next_node_map[productId] ?? node?.next_node_map.default;
    if (next && nodesById[next]?.type === "checkout") {
      advance(next, nodesById, productsById, item.id);
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
      body: JSON.stringify({ sessionId, surveyResponses: merged }),
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
    result: { ok: boolean; items: GreetingItem[] },
  ) {
    setTimeline((prev) => [
      ...prev.filter((i) => i.id !== item.id),
      { id: nextId(), kind: "checkout-result", ok: result.ok, items: result.items },
    ]);
    if (result.ok) setOrderConfirmed(true);

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(resetConversation, RESET_AFTER_COMPLETE_MS);
  }

  const detailProduct = detailContext ? productsById[detailContext.productId] : null;

  return (
    <div className="relative flex h-full flex-col bg-yellow-50">
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
              return (
                <CheckoutForm
                  key={item.id}
                  product={product}
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
                  surveyResponses={surveyAnswers}
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

      {menuItems.length > 0 && (
        <div className="flex shrink-0 divide-x divide-neutral-200 border-t border-neutral-200 bg-white">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleMenuItemClick(item)}
              className="flex-1 px-2 py-3 text-center text-xs text-neutral-700 hover:bg-neutral-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

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
