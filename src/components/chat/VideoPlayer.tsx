import { aspectRatioToPaddingPercent, getVideoEmbedInfo } from "@/lib/video-embed";

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
        // aspect-ratio CSSに対応していない環境でも高さが0にならないよう、
        // padding-bottom(%)で埋め込み枠の高さを確保する
        <div
          className="relative w-full overflow-hidden rounded-lg bg-neutral-100"
          style={{ paddingBottom: `${aspectRatioToPaddingPercent(aspectRatio)}%` }}
        >
          <iframe
            src={info.src}
            title="動画"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <video src={info.src} controls className="w-full rounded-lg bg-neutral-100" />
      )}
      {caption && <p className="text-sm text-neutral-600">{caption}</p>}
    </div>
  );
}
