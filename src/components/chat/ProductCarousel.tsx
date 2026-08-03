import type { WidgetProduct } from "@/components/chat/types";
import { ProductCard } from "@/components/chat/ProductCard";

/** 2〜3件はプラン比較しやすいよう縦積み、4件以上は横スクロールカルーセルにする。 */
export function ProductCarousel({
  products,
  onSelect,
}: {
  products: WidgetProduct[];
  onSelect?: (productId: string) => void;
}) {
  if (products.length <= 3) {
    return (
      <div className="max-w-[95%] space-y-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            fullWidth
            onSelect={onSelect ? () => onSelect(product.id) : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {products.map((product) => (
        <div key={product.id} className="w-64 shrink-0">
          <ProductCard product={product} onSelect={onSelect ? () => onSelect(product.id) : undefined} />
        </div>
      ))}
    </div>
  );
}
