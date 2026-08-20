export const DEFAULT_VIDEO_ASPECT_RATIO = "16:9";

/**
 * 埋め込み枠の高さを、親要素の幅に対するpadding-bottomの%で表す(古いブラウザでもaspect-ratio CSSに
 * 依存せず高さが0になることを防ぐため)。
 */
export function aspectRatioToPaddingPercent(aspectRatio: string | undefined): number {
  const [w, h] = (aspectRatio ?? DEFAULT_VIDEO_ASPECT_RATIO).split(":");
  const width = Number(w);
  const height = Number(h);
  return width > 0 && height > 0 ? (height / width) * 100 : (9 / 16) * 100;
}

export type VideoEmbedInfo = { kind: "iframe"; src: string } | { kind: "file"; src: string };

function simplifyRatio(width: number, height: number): string {
  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }
  const divisor = gcd(Math.round(width), Math.round(height)) || 1;
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function detectFileAspectRatio(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (video.videoWidth && video.videoHeight) {
        resolve(simplifyRatio(video.videoWidth, video.videoHeight));
      } else {
        reject(new Error("動画の縦横比を取得できませんでした"));
      }
    };
    video.onerror = () => reject(new Error("動画を読み込めませんでした"));
    video.src = url;
  });
}

/**
 * 動画URLから縦横比を自動検知する。
 * 直接ファイルURLは<video>要素で実測し、YouTube/VimeoはoEmbed APIから取得する
 * (YouTube ShortsはoEmbedのURLパスからも判定する)。取得できない場合は16:9とする。
 */
export async function detectAspectRatio(url: string): Promise<string> {
  const info = getVideoEmbedInfo(url);
  if (info.kind === "file") {
    return detectFileAspectRatio(url);
  }

  if (/\/shorts\//.test(url)) return "9:16";

  const isVimeo = /vimeo\.com/.test(info.src);
  const oembedUrl = isVimeo
    ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
    : `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

  const res = await fetch(oembedUrl);
  if (!res.ok) throw new Error("動画情報の取得に失敗しました");
  const data = (await res.json()) as { width?: number; height?: number };
  if (!data.width || !data.height) throw new Error("動画の縦横比を取得できませんでした");
  return simplifyRatio(data.width, data.height);
}

/**
 * ノード一覧の折りたたみ表示用サムネイルURL。YouTubeはIDから静的なサムネイルURLを導出できるが、
 * Vimeo・直接ファイルURLには同様の仕組みがないため取得できない(nullを返す)。
 */
export function getVideoThumbnailUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      }
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
      if (shortsMatch) return `https://img.youtube.com/vi/${shortsMatch[1]}/hqdefault.jpg`;
      const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
      if (embedMatch) return `https://img.youtube.com/vi/${embedMatch[1]}/hqdefault.jpg`;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
  } catch {
    // 不正なURLはサムネイル対象外として扱う
  }
  return null;
}

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
