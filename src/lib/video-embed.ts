export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];
export const DEFAULT_VIDEO_ASPECT_RATIO: VideoAspectRatio = "16:9";

export function aspectRatioToCss(aspectRatio: string | undefined): string {
  const [w, h] = (aspectRatio ?? DEFAULT_VIDEO_ASPECT_RATIO).split(":");
  const width = Number(w);
  const height = Number(h);
  return width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9";
}

export type VideoEmbedInfo = { kind: "iframe"; src: string } | { kind: "file"; src: string };

/**
 * YouTube/Vimeoの各種URL形式を埋め込み再生用URLに変換する。
 * それ以外のURLは直接の動画ファイル(mp4等)として<video>タグでインライン再生する。
 */
export function getVideoEmbedInfo(url: string): VideoEmbedInfo {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        if (id) return { kind: "iframe", src: `https://www.youtube.com/embed/${id}` };
      }
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
      if (shortsMatch) return { kind: "iframe", src: `https://www.youtube.com/embed/${shortsMatch[1]}` };
      if (parsed.pathname.startsWith("/embed/")) return { kind: "iframe", src: url };
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      if (id) return { kind: "iframe", src: `https://www.youtube.com/embed/${id}` };
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      if (id) return { kind: "iframe", src: `https://player.vimeo.com/video/${id}` };
    }
    if (host === "player.vimeo.com") {
      return { kind: "iframe", src: url };
    }
  } catch {
    // 不正なURLはそのままファイルURLとして扱う
  }
  return { kind: "file", src: url };
}
