"use client";

interface ImageCarouselProps {
  imageUrls: string[];
  linkUrl?: string;
  caption?: string;
}

export function ImageCarousel({ imageUrls, linkUrl, caption }: ImageCarouselProps) {
  return (
    <div className="max-w-[85%] space-y-1">
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-lg">
        {imageUrls.map((url, index) =>
          linkUrl ? (
            <a
              key={index}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 snap-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-48 w-48 rounded-lg object-cover" />
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={index}
              src={url}
              alt=""
              className="h-48 w-48 shrink-0 snap-center rounded-lg object-cover"
            />
          ),
        )}
      </div>
      {caption && <p className="text-sm text-neutral-700">{caption}</p>}
    </div>
  );
}
