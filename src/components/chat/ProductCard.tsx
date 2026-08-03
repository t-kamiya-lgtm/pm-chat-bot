import type { WidgetProduct } from "@/components/chat/types";
import { ProductPrice, productDiscountPercent } from "@/components/chat/ProductPrice";

export function ProductCard({
  product,
  onSelect,
  onViewDetail,
}: {
  product: WidgetProduct;
  onSelect?: () => void;
  onViewDetail?: () => void;
}) {
  const discountPercent = productDiscountPercent(product);

  return (
    <div className="max-w-[85%] rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      {product.image_url && (
        <div className="relative mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={product.name}
            className="aspect-square w-full rounded-lg object-cover"
          />
          {discountPercent !== null && (
            <span className="absolute top-2 left-2 rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white shadow">
              {discountPercent}%OFF
            </span>
          )}
        </div>
      )}
      {onViewDetail ? (
        <button
          type="button"
          onClick={onViewDetail}
          className="text-left font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
        >
          {product.name}
        </button>
      ) : (
        <p className="font-medium">{product.name}</p>
      )}

      <ProductPrice product={product} />

      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          className="mt-3 w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700"
        >
          この商品を注文する
        </button>
      )}
    </div>
  );
}
