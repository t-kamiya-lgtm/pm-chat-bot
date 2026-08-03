import type { WidgetProduct } from "@/components/chat/types";
import { ProductCard } from "@/components/chat/ProductCard";

export function ProductCarousel({
  products,
  onSelect,
}: {
  products: WidgetProduct[];
  onSelect?: (productId: string) => void;
}) {
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
