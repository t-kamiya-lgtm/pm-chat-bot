import type { WidgetProduct } from "@/components/chat/types";

/** 商品ごとに選べる「比較価格(打消線)」のラベルと金額を解決する。未設定/対象外ならnull。 */
export function resolveComparePrice(product: WidgetProduct): { label: string; amount: number } | null {
  switch (product.compare_price_type) {
    case "list_price":
      return product.list_price !== null ? { label: "通常価格", amount: product.list_price } : null;
    case "unit_total":
      return product.unit_total_price !== null
        ? { label: "単品合計価格", amount: product.unit_total_price }
        : null;
    case "custom":
      return product.custom_compare_price !== null
        ? { label: product.custom_compare_label || "比較価格", amount: product.custom_compare_price }
        : null;
    default:
      return null;
  }
}

export function productDiscountPercent(product: WidgetProduct): number | null {
  const compare = resolveComparePrice(product);
  if (!compare || compare.amount <= product.price) return null;
  return Math.round((1 - product.price / compare.amount) * 100);
}

export function ProductPrice({ product }: { product: WidgetProduct }) {
  const compare = resolveComparePrice(product);
  const showCompare = compare !== null && compare.amount > product.price;
  const shippingText =
    product.shipping_fee === 0 ? "送料無料" : `送料 ${product.shipping_fee.toLocaleString()}円`;
  const hasFirstTimePrice =
    product.order_type === "subscription" &&
    product.first_time_price !== null &&
    product.first_time_price < product.price;
  const priceLabel = product.price_label || "特別";

  return (
    <div className={showCompare ? "mt-2 rounded-lg bg-red-50 p-2" : "mt-2"}>
      {showCompare && (
        <p className="text-xs text-neutral-400">
          {compare!.label} <span className="line-through">{compare!.amount.toLocaleString()}円</span>
        </p>
      )}
      {hasFirstTimePrice ? (
        <>
          <p className={showCompare ? "text-xs text-neutral-500" : "text-sm text-neutral-600"}>
            {priceLabel}価格{" "}
            <span className={showCompare ? "line-through" : undefined}>
              {product.price.toLocaleString()}円
            </span>
          </p>
          <p className="text-lg leading-tight font-bold text-red-600">
            初回限定 {product.first_time_price!.toLocaleString()}円
          </p>
        </>
      ) : showCompare ? (
        <p className="text-lg leading-tight font-bold text-red-600">
          {priceLabel}価格 {product.price.toLocaleString()}円
        </p>
      ) : (
        <p className="text-sm">
          {product.price.toLocaleString()}円({shippingText})
        </p>
      )}
      {(showCompare || hasFirstTimePrice) && (
        <p className="text-xs text-neutral-500">{shippingText}</p>
      )}
      {hasFirstTimePrice && (
        <p className="text-xs text-red-600">2回目以降 {product.price.toLocaleString()}円</p>
      )}
    </div>
  );
}
