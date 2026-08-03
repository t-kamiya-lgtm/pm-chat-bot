import type { WidgetProduct } from "@/components/chat/types";
import { ProductPrice } from "@/components/chat/ProductPrice";

export function ProductDetailPanel({
  product,
  onSelect,
  onClose,
}: {
  product: WidgetProduct;
  onSelect?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 p-4">
        <p className="font-medium">商品詳細</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="text-2xl leading-none text-neutral-400 hover:text-neutral-600"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            className="aspect-square w-full rounded-lg object-cover"
          />
        )}
        <p className="mt-3 text-lg font-medium">{product.name}</p>
        <ProductPrice product={product} />
        {product.description && (
          <p className="mt-3 text-sm whitespace-pre-wrap text-neutral-600">{product.description}</p>
        )}
      </div>

      {onSelect && (
        <div className="border-t border-neutral-200 p-4">
          <button
            type="button"
            onClick={onSelect}
            className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700"
          >
            この商品を注文する
          </button>
        </div>
      )}
    </div>
  );
}
