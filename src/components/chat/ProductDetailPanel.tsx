import { useRef, useState } from "react";
import type { WidgetProduct } from "@/components/chat/types";
import { ProductPrice } from "@/components/chat/ProductPrice";

function ImageGallery({ images, alt }: { images: string[]; alt: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (images.length === 0) return null;

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-lg"
      >
        {images.map((url, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={index}
            src={url}
            alt={alt}
            className="aspect-square w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {images.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 w-1.5 rounded-full ${
                index === activeIndex ? "bg-neutral-900" : "bg-neutral-300"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductDetailPanel({
  product,
  onSelect,
  onClose,
}: {
  product: WidgetProduct;
  onSelect?: () => void;
  onClose: () => void;
}) {
  const images =
    product.image_urls.length > 0 ? product.image_urls : product.image_url ? [product.image_url] : [];

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
        <ImageGallery images={images} alt={product.name} />
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
