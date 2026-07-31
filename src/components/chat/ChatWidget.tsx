"use client";

import { useEffect, useRef, useState } from "react";
import type { WidgetProduct, WidgetScenarioNode } from "@/components/chat/types";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ChoiceButtons, type ChoiceOption } from "@/components/chat/ChoiceButtons";
import { ProductCard } from "@/components/chat/ProductCard";
import { CheckoutForm } from "@/components/chat/CheckoutForm";
import { FaqPanel } from "@/components/chat/FaqPanel";

type TimelineItem =
  | { id: string; kind: "bot-text"; text: string }
  | { id: string; kind: "user-text"; text: string }
  | {
      id: string;
      kind: "choice";
      nodeId: string;
      text: string;
      options: ChoiceOption[];
      resolved: boolean;
    }
  | { id: string; kind: "product"; nodeId: string; productId: string; resolved: boolean }
  | { id: string; kind: "checkout"; nodeId: string; productId: string }
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
  const [lastProductId, setLastProductId] = useState<string | null>(null);
  const [showPersistentFaq, setShowPersistentFaq] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  ) {
    const node = nodeMap[nodeId];
    if (!node) return;

    const content = node.content as {
      text?: string;
      productId?: string;
      options?: ChoiceOption[];
    };

    switch (node.type) {
      case "message": {
        setTimeline((prev) => [...prev, { id: nextId(), kind: "bot-text", text: content.text ?? "" }]);
        const next = node.next_node_map.default;
        if (next) setTimeout(() => advance(next, nodeMap, productMap), 300);
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
        const productId = content.productId;
        if (!productId || !productMap[productId]) {
          setTimeline((prev) => [
            ...prev,
            { id: nextId(), kind: "bot-text", text: "商品情報の読み込みに失敗しました。" },
          ]);
          break;
        }
        setLastProductId(productId);
        setTimeline((prev) => [
          ...prev,
          node.type === "product"
            ? { id: nextId(), kind: "product", nodeId: node.id, productId, resolved: false }
            : { id: nextId(), kind: "checkout", nodeId: node.id, productId },
        ]);
        break;
      }
      case "product_qa": {
        const productId = content.productId ?? lastProductId;
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
    if (next) advance(next);
  }

  function handleProductSelect(item: Extract<TimelineItem, { kind: "product" }>) {
    setTimeline((prev) => prev.map((i) => (i.id === item.id ? { ...i, resolved: true } : i)));

    const node = nodesById[item.nodeId];
    const next = node?.next_node_map.default;
    if (next && nodesById[next]?.type === "checkout") {
      advance(next);
    } else {
      // シナリオ側で決済導線への接続が未設定でも購入導線を提供する
      setTimeline((prev) => [
        ...prev,
        { id: nextId(), kind: "checkout", nodeId: item.nodeId, productId: item.productId },
      ]);
    }
  }

  function handleCheckoutComplete(result: { ok: boolean; message: string }) {
    setTimeline((prev) => [
      ...prev,
      { id: nextId(), kind: "checkout-result", ok: result.ok, text: result.message },
    ]);
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {loadError && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-700">{loadError}</p>
        )}
        {timeline.map((item) => {
          switch (item.kind) {
            case "bot-text":
              return <MessageBubble key={item.id} message={{ id: item.id, from: "bot", kind: "text", text: item.text }} />;
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
              const product = productsById[item.productId];
              if (!product) return null;
              return (
                <ProductCard
                  key={item.id}
                  product={product}
                  onSelect={item.resolved ? undefined : () => handleProductSelect(item)}
                />
              );
            }
            case "checkout": {
              const product = productsById[item.productId];
              if (!product) return null;
              return (
                <CheckoutForm key={item.id} product={product} onComplete={handleCheckoutComplete} />
              );
            }
            case "faq":
              return (
                <FaqPanel
                  key={item.id}
                  productId={item.productId}
                  productName={productsById[item.productId]?.name}
                  onClose={() => setShowPersistentFaq(false)}
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

      {lastProductId && (
        <div className="border-t border-neutral-200 p-2">
          {showPersistentFaq ? (
            <FaqPanel
              productId={lastProductId}
              productName={productsById[lastProductId]?.name}
              onClose={() => setShowPersistentFaq(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowPersistentFaq(true)}
              className="w-full rounded-md border border-neutral-300 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              この商品について質問する
            </button>
          )}
        </div>
      )}
    </div>
  );
}
