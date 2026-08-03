import type { WidgetProduct } from "@/components/chat/types";

export function productDiscountPercent(product: WidgetProduct): number | null {
  if (product.list_price === null || product.list_price <= product.price) return null;
  return Math.round((1 - product.price / product.list_price) * 100);
}

export function ProductPrice({ product }: { product: WidgetProduct }) {
  const discountPercent = productDiscountPercent(product);
  const shippingText =
    product.shipping_fee === 0 ? "送料無料" : `送料 ${product.shipping_fee.toLocaleString()}円`;

  if (discountPercent === null) {
    return (
      <p className="mt-2 text-sm">
        {product.price.toLocaleString()}円({shippingText})
      </p>
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
    </div>
  );
}
