import type { WidgetProduct } from "@/components/chat/types";

export function productDiscountPercent(product: WidgetProduct): number | null {
  if (product.list_price === null || product.list_price <= product.price) return null;
  return Math.round((1 - product.price / product.list_price) * 100);
}

export function ProductPrice({ product }: { product: WidgetProduct }) {
  const discountPercent = productDiscountPercent(product);
  const shippingText =
    product.shipping_fee === 0 ? "送料無料" : `送料 ${product.shipping_fee.toLocaleString()}円`;
  const hasFirstTimePrice =
    product.order_type === "subscription" &&
    product.first_time_price !== null &&
    product.first_time_price < product.price;

  if (discountPercent === null) {
    return (
      <div className="mt-2">
        <p className="text-sm">
          {product.price.toLocaleString()}円({shippingText})
        </p>
        {hasFirstTimePrice && (
          <p className="text-xs text-red-600">
            初回限定 {product.first_time_price!.toLocaleString()}円(2回目以降 {product.price.toLocaleString()}円)
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg bg-red-50 p-2">
      <p className="text-xs text-neutral-400">
        通常価格 <span className="line-through">{product.list_price!.toLocaleString()}円</span>
      </p>
      <p className="text-lg leading-tight font-bold text-red-600">
        {product.price_label || "特別"}価格 {product.price.toLocaleString()}円
      </p>
      <p className="text-xs text-neutral-500">{shippingText}</p>
      {hasFirstTimePrice && (
        <p className="text-xs text-red-600">
          初回限定 {product.first_time_price!.toLocaleString()}円(2回目以降 {product.price.toLocaleString()}円)
        </p>
      )}
    </div>
  );
}
