/**
 * 固定メニューのレイアウト定義。
 * 管理画面のレイアウト選択(コマ数/段数での絞り込み)と、ウィジェット側の実表示
 * (テキストモード・画像モードのクリック領域)の両方で、このジオメトリを共有する。
 * 各レイアウトの`cells`は、メニュー項目(display_order順)を先頭から順に当てはめる位置。
 */
export type MenuLayoutKey =
  | "row-1"
  | "row-2"
  | "row-3"
  | "row-4"
  | "rows-3-3"
  | "rows-4-4"
  | "rows-3-1"
  | "rows-1-3"
  | "rows-2-4"
  | "rows-4-1"
  | "lshape-left"
  | "lshape-right"
  | "wide-2-1"
  | "wide-1-2"
  | "grid5-left"
  | "grid5-right";

export interface MenuLayoutCell {
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
}

export interface MenuLayoutDef {
  key: MenuLayoutKey;
  label: string;
  rows: 1 | 2;
  columns: number;
  columnWidths: number[];
  cells: MenuLayoutCell[];
}

export const DEFAULT_MENU_LAYOUT_KEY: MenuLayoutKey = "row-3";

export const MENU_LAYOUTS: MenuLayoutDef[] = [
  { key: "row-1", label: "1段 × 1列", rows: 1, columns: 1, columnWidths: [1], cells: [{ col: 0, row: 0 }] },
  {
    key: "row-2",
    label: "1段 × 2列",
    rows: 1,
    columns: 2,
    columnWidths: [1, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ],
  },
  {
    key: "row-3",
    label: "1段 × 3列",
    rows: 1,
    columns: 3,
    columnWidths: [1, 1, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ],
  },
  {
    key: "row-4",
    label: "1段 × 4列",
    rows: 1,
    columns: 4,
    columnWidths: [1, 1, 1, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
    ],
  },
  {
    key: "rows-3-3",
    label: "2段 × (3+3)",
    rows: 2,
    columns: 3,
    columnWidths: [1, 1, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ],
  },
  {
    key: "rows-4-4",
    label: "2段 × (4+4)",
    rows: 2,
    columns: 4,
    columnWidths: [1, 1, 1, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 3, row: 1 },
    ],
  },
  {
    key: "rows-3-1",
    label: "2段 × (3+1)",
    rows: 2,
    columns: 3,
    columnWidths: [1, 1, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 0, row: 1, colSpan: 3 },
    ],
  },
  {
    key: "rows-1-3",
    label: "2段 × (1+3)",
    rows: 2,
    columns: 3,
    columnWidths: [1, 1, 1],
    cells: [
      { col: 0, row: 0, colSpan: 3 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ],
  },
  {
    key: "rows-2-4",
    label: "2段 × (2+4)",
    rows: 2,
    columns: 4,
    columnWidths: [1, 1, 1, 1],
    cells: [
      { col: 0, row: 0, colSpan: 2 },
      { col: 2, row: 0, colSpan: 2 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 3, row: 1 },
    ],
  },
  {
    key: "rows-4-1",
    label: "2段 × (4+1)",
    rows: 2,
    columns: 4,
    columnWidths: [1, 1, 1, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
      { col: 0, row: 1, colSpan: 4 },
    ],
  },
  {
    key: "lshape-left",
    label: "L字 × 左大+右2分割",
    rows: 2,
    columns: 2,
    columnWidths: [1, 1],
    cells: [
      { col: 0, row: 0, rowSpan: 2 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
    ],
  },
  {
    key: "lshape-right",
    label: "L字 × 右大+左2分割",
    rows: 2,
    columns: 2,
    columnWidths: [1, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 0, rowSpan: 2 },
    ],
  },
  {
    key: "wide-2-1",
    label: "1段 × 2列(幅比 2:1)",
    rows: 1,
    columns: 2,
    columnWidths: [2, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ],
  },
  {
    key: "wide-1-2",
    label: "1段 × 2列(幅比 1:2)",
    rows: 1,
    columns: 2,
    columnWidths: [1, 2],
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ],
  },
  {
    key: "grid5-left",
    label: "5コマ × 左2×2+右1(全高)",
    rows: 2,
    columns: 3,
    columnWidths: [1, 1, 1],
    cells: [
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 2, row: 0, rowSpan: 2 },
    ],
  },
  {
    key: "grid5-right",
    label: "5コマ × 左1(全高)+右2×2",
    rows: 2,
    columns: 3,
    columnWidths: [1, 1, 1],
    cells: [
      { col: 0, row: 0, rowSpan: 2 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 2, row: 0 },
      { col: 2, row: 1 },
    ],
  },
];

export function getMenuLayout(key: string | null | undefined): MenuLayoutDef {
  return (
    MENU_LAYOUTS.find((layout) => layout.key === key) ??
    (MENU_LAYOUTS.find((layout) => layout.key === DEFAULT_MENU_LAYOUT_KEY) as MenuLayoutDef)
  );
}

export function menuLayoutCapacity(key: string | null | undefined): number {
  return getMenuLayout(key).cells.length;
}

export function menuGridTemplateColumns(layout: MenuLayoutDef): string {
  return layout.columnWidths.map((w) => `${w}fr`).join(" ");
}

export function menuGridTemplateRows(layout: MenuLayoutDef): string {
  return `repeat(${layout.rows}, 1fr)`;
}

export function menuCellGridColumn(cell: MenuLayoutCell): string {
  return `${cell.col + 1} / span ${cell.colSpan ?? 1}`;
}

export function menuCellGridRow(cell: MenuLayoutCell): string {
  return `${cell.row + 1} / span ${cell.rowSpan ?? 1}`;
}
