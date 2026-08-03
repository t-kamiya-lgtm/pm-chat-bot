import type { WidgetProduct } from "@/components/chat/types";

export function ProductCard({
  product,
  onSelect,
  fullWidth,
}: {
  product: WidgetProduct;
  onSelect?: () => void;
  fullWidth?: boolean;
}) {
  const hasDiscount = product.list_price !== null && product.list_price > product.price;
  const discountPercent = hasDiscount
    ? Math.round((1 - product.price / product.list_price!) * 100)
    : 0;
  const shippingText =
    product.shipping_fee === 0 ? "送料無料" : `送料 ${product.shipping_fee.toLocaleString()}円`;

  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white p-3 shadow-sm ${fullWidth ? "" : "max-w-[85%]"}`}
    >
      {product.image_url && (
        <div className="relative mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={product.name}
            className="h-36 w-full rounded-lg object-cover"
          />
          {hasDiscount && (
            <span className="absolute top-2 left-2 rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white shadow">
              {discountPercent}%OFF
            </span>
          )}
        </div>
      )}
      <p className="font-medium">{product.name}</p>
      {product.description && (
        <p className="mt-1 text-xs text-neutral-500">{product.description}</p>
      )}

      {hasDiscount ? (
        <div className="mt-2 rounded-lg bg-red-50 p-2">
          <p className="text-xs text-neutral-400">
            通常価格 <span className="line-through">{product.list_price!.toLocaleString()}円</span>
          </p>
          <p className="text-lg leading-tight font-bold text-red-600">
            {product.price_label || "特別"}価格 {product.price.toLocaleString()}円
          </p>
          <p className="text-xs text-neutral-500">{shippingText}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm">
          {product.price.toLocaleString()}円({shippingText})
        </p>
      )}

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
