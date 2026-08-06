import { aspectRatioToCss, getVideoEmbedInfo } from "@/lib/video-embed";

export function VideoPlayer({
  url,
  aspectRatio,
  caption,
}: {
  url: string;
  aspectRatio?: string;
  caption?: string;
}) {
  const info = getVideoEmbedInfo(url);

  return (
    <div className="max-w-[85%] space-y-1">
      {info.kind === "iframe" ? (
        <div className="overflow-hidden rounded-lg" style={{ aspectRatio: aspectRatioToCss(aspectRatio) }}>
          <iframe
            src={info.src}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <video src={info.src} controls className="w-full rounded-lg" />
      )}
      {caption && <p className="text-sm text-neutral-600">{caption}</p>}
    </div>
  );
}
