"use client";

interface ImageCarouselProps {
  imageUrls: string[];
  linkUrl?: string;
  caption?: string;
}

export function ImageCarousel({ imageUrls, linkUrl, caption }: ImageCarouselProps) {
  return (
    // チャット幅いっぱいに表示する。1枚ずつスナップさせることで、
    // 幅が足りずに2枚目が中途半端に欠けて見える状態を防ぐ。
    <div className="w-full space-y-1">
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-lg">
        {imageUrls.map((url, index) =>
          linkUrl ? (
            <a
              key={index}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full shrink-0 snap-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={index}
              src={url}
              alt=""
              className="aspect-square w-full shrink-0 snap-center rounded-lg object-cover"
            />
          ),
        )}
      </div>
      {imageUrls.length > 1 && (
        <p className="text-xs text-neutral-400">横にスワイプすると次の画像が見られます({imageUrls.length}枚)</p>
      )}
      {caption && <p className="text-sm text-neutral-700">{caption}</p>}
    </div>
  );
}
