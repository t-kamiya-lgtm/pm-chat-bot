"use client";

import { useEffect, useRef, useState } from "react";
import type { WidgetProduct, WidgetScenarioNode } from "@/components/chat/types";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ChoiceButtons, type ChoiceOption } from "@/components/chat/ChoiceButtons";
import { ProductCarousel } from "@/components/chat/ProductCarousel";
import { ProductDetailPanel } from "@/components/chat/ProductDetailPanel";
import { CheckoutForm } from "@/components/chat/CheckoutForm";
import { FaqPanel } from "@/components/chat/FaqPanel";

type TimelineItem =
  | { id: string; kind: "bot-text"; text: string; imageUrl?: string }
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
      kind: "checkout";
      nodeId: string;
      productId: string;
      sourceItemId?: string;
      greeting?: string;
      completionMessage?: string;
      termsText?: string;
      privacyText?: string;
    }
  | { id: string; kind: "checkout-result"; ok: boolean; text: string }
  | { id: string; kind: "faq"; productId: string };

let seq = 0;
function nextId() {
  seq += 1;
  return `item-${seq}`;
}

export function ChatWidget() {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [nodesById, setNodesById] = useState<Record<string, WidgetScenarioNode>>({});
  const [productsById, setProductsById] = useState<Record<string, WidgetProduct>>({});
  const [checkoutMessages, setCheckoutMessages] = useState<{
    greeting?: string;
    completionMessage?: string;
    termsText?: string;
    privacyText?: string;
  }>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailContext, setDetailContext] = useState<{
    item: Extract<TimelineItem, { kind: "product" }>;
    productId: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/widget/checkout-messages")
      .then((res) => res.json())
      .then(
        (body: {
          greeting?: string;
          completionMessage?: string;
          termsText?: string;
          privacyText?: string;
        }) => setCheckoutMessages(body),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/widget/scenario")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "読み込みに失敗しました");
        return res.json();
      })
      .then((body: { nodes: WidgetScenarioNode[]; products: WidgetProduct[] }) => {
        const nodeMap: Record<string, WidgetScenarioNode> = {};
        for (const node of body.nodes) nodeMap[node.id] = node;
        const productMap: Record<string, WidgetProduct> = {};
        for (const product of body.products) productMap[product.id] = product;

        setNodesById(nodeMap);
        setProductsById(productMap);

        const entry = body.nodes.find((n) => n.is_entry) ?? body.nodes[0];
        if (entry) advance(entry.id, nodeMap, productMap);
      })
      .catch((err) => setLoadError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [timeline]);

  function advance(
    nodeId: string,
    nodeMap: Record<string, WidgetScenarioNode> = nodesById,
    productMap: Record<string, WidgetProduct> = productsById,
    sourceItemId?: string,
  ) {
    const node = nodeMap[nodeId];
    if (!node) return;

    const content = node.content as {
      text?: string;
      imageUrl?: string;
      productId?: string;
      productIds?: string[];
      options?: ChoiceOption[];
    };

    switch (node.type) {
      case "message": {
        setTimeline((prev) => [
          ...prev,
          { id: nextId(), kind: "bot-text", text: content.text ?? "", imageUrl: content.imageUrl },
        ]);
        const next = node.next_node_map.default;
        if (next) setTimeout(() => advance(next, nodeMap, productMap, sourceItemId), 300);
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
            ...prev,
            {
              id: nextId(),
              kind: "checkout",
              nodeId: node.id,
              productId: validIds[0],
              sourceItemId,
              greeting: checkoutMessages.greeting,
              completionMessage: checkoutMessages.completionMessage,
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
        setTimeline((prev) => [...prev, { id: nextId(), kind: "faq", productId }]);
        break;
      }
      default:
        break;
    }
  }

  function handleChoiceSelect(item: Extract<TimelineItem, { kind: "choice" }>, option: ChoiceOption) {
    setTimeline((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, resolved: true } : i)),
    );
    setTimeline((prev) => [...prev, { id: nextId(), kind: "user-text", text: option.label }]);

    const node = nodesById[item.nodeId];
    const next = node?.next_node_map[option.value] ?? node?.next_node_map.default;
    if (next) advance(next, nodesById, productsById, item.id);
  }

  function handleProductSelect(item: Extract<TimelineItem, { kind: "product" }>, productId: string) {
    setTimeline((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: true } : i)));

    const node = nodesById[item.nodeId];
    const next = node?.next_node_map.default;
    if (next && nodesById[next]?.type === "checkout") {
      advance(next, nodesById, productsById, item.id);
    } else {
      // シナリオ側で決済導線への接続が未設定でも購入導線を提供する
      setTimeline((prev) => [
        ...prev,
        {
          id: nextId(),
          kind: "checkout",
          nodeId: item.nodeId,
          productId,
          sourceItemId: item.id,
          greeting: checkoutMessages.greeting,
          completionMessage: checkoutMessages.completionMessage,
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

  function handleCheckoutComplete(result: { ok: boolean; message: string }) {
    setTimeline((prev) => [
      ...prev,
      { id: nextId(), kind: "checkout-result", ok: result.ok, text: result.message },
    ]);
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
                  message={{ id: item.id, from: "bot", kind: "text", text: item.text, imageUrl: item.imageUrl }}
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
            case "checkout": {
              const product = productsById[item.productId];
              if (!product) return null;
              return (
                <CheckoutForm
                  key={item.id}
                  product={product}
                  greeting={item.greeting}
                  completionMessage={item.completionMessage}
                  termsText={item.termsText}
                  privacyText={item.privacyText}
                  onComplete={handleCheckoutComplete}
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
                  onClose={() => setTimeline((prev) => prev.filter((i) => i.id !== item.id))}
                />
              );
            case "checkout-result":
              return (
                <div
                  key={item.id}
                  className={`max-w-[85%] rounded-lg p-3 text-sm ${
                    item.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
                  }`}
                >
                  {item.text}
                </div>
              );
            default:
              return null;
          }
        })}
      </div>

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
