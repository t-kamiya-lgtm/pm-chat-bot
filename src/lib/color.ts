/** 背景色の相対輝度から、視認性の高いテキスト色(白/黒)を判定する。 */
export function contrastTextColor(hex: string): "white" | "black" {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return "black";
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.5 ? "black" : "white";
}

export type TextColorOverride = "white" | "black" | null;

/** 背景色に対して使うテキスト色。手動指定があればそれを優先し、無ければ自動判定する。 */
export function effectiveTextColor(backgroundColor: string | null, override: TextColorOverride): "white" | "black" {
  return override ?? contrastTextColor(backgroundColor ?? "#FFFFFF");
}
