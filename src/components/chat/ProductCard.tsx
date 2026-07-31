import type { WidgetProduct } from "@/components/chat/types";

export function ProductCard({
  product,
  onSelect,
}: {
  product: WidgetProduct;
  onSelect?: () => void;
}) {
  return (
    <div className="max-w-[85%] rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      {product.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt={product.name}
          className="mb-2 h-32 w-full rounded-lg object-cover"
        />
      )}
      <p className="font-medium">{product.name}</p>
      {product.description && (
        <p className="mt-1 text-xs text-neutral-500">{product.description}</p>
      )}
      <p className="mt-2 text-sm">
        {product.price.toLocaleString()}円
        {product.shipping_fee === 0 ? "(送料無料)" : `(送料 ${product.shipping_fee.toLocaleString()}円)`}
      </p>
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
