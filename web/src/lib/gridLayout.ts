export interface GridCardConfig {
  id: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface DashboardLayout {
  cards: GridCardConfig[];
  mode: 'fill' | 'scroll';
  totalRows: number;
  version: number;
}

const GRID_GRANULARITY = 2;

export const GRID_COLS = 6 * GRID_GRANULARITY;
export const DEFAULT_TOTAL_ROWS = 5 * GRID_GRANULARITY;
export const GRID_GAP = 16;
export const SCROLL_ROW_HEIGHT = 90;

export const CARD_MIN_SIZES: Record<string, { minCol: number; minRow: number }> = {
  briefing: { minCol: 1, minRow: 1 },
  'day-calendar': { minCol: 1, minRow: 1 },
  'week-calendar': { minCol: 1, minRow: 1 },
  'month-calendar': { minCol: 1, minRow: 1 },
  chores: { minCol: 1, minRow: 1 },
  tasks: { minCol: 1, minRow: 1 },
  services: { minCol: 1, minRow: 1 },
  media: { minCol: 1, minRow: 1 },
  'sanders-cash': { minCol: 1, minRow: 1 },
  weather: { minCol: 1, minRow: 1 },
};

export const DEFAULT_GRID_LAYOUT: DashboardLayout = {
  mode: 'scroll',
  totalRows: DEFAULT_TOTAL_ROWS,
  version: GRID_GRANULARITY,
  cards: [
    { id: 'briefing', col: 1, row: 1, colSpan: 12, rowSpan: 2 },
    { id: 'day-calendar', col: 1, row: 3, colSpan: 4, rowSpan: 4 },
    { id: 'week-calendar', col: 5, row: 3, colSpan: 4, rowSpan: 4 },
    { id: 'month-calendar', col: 9, row: 3, colSpan: 4, rowSpan: 4 },
    { id: 'chores', col: 1, row: 7, colSpan: 4, rowSpan: 4 },
    { id: 'tasks', col: 5, row: 7, colSpan: 4, rowSpan: 2 },
    { id: 'sanders-cash', col: 9, row: 7, colSpan: 4, rowSpan: 4 },
    { id: 'services', col: 5, row: 9, colSpan: 2, rowSpan: 2 },
    { id: 'media', col: 7, row: 9, colSpan: 2, rowSpan: 2 },
    { id: 'weather', col: 1, row: 11, colSpan: 12, rowSpan: 2 },
  ],
};

interface OldCardConfig {
  id: string;
  colSpan: number;
}

export function migrateLayout(raw: unknown): DashboardLayout | null {
  if (!raw || typeof raw !== 'object') return null;

  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    const first = raw[0] as Record<string, unknown>;
    if ('col' in first && 'row' in first) {
      return scaleLegacyLayout({ cards: raw as GridCardConfig[], mode: 'scroll', totalRows: 5, version: 1 });
    }
    return migrateOldFormat(raw as OldCardConfig[]);
  }

  const obj = raw as Record<string, unknown>;
  if ('cards' in obj && Array.isArray(obj.cards)) {
    const layout = obj as unknown as DashboardLayout;
    if (layout.version === GRID_GRANULARITY) {
      return layout;
    }
    return scaleLegacyLayout(layout);
  }

  return null;
}

const DEFAULT_ROW_SPANS: Record<string, number> = {
  'day-calendar': 4,
  'week-calendar': 4,
  'month-calendar': 4,
  chores: 4,
  'sanders-cash': 4,
};

function migrateOldFormat(old: OldCardConfig[]): DashboardLayout {
  const cards: GridCardConfig[] = [];
  let curRow = 1;
  let curCol = 1;

  for (const c of old) {
    const newColSpan = Math.min(c.colSpan * GRID_GRANULARITY, GRID_COLS);
    const rowSpan = DEFAULT_ROW_SPANS[c.id] || 1;
    if (curCol + newColSpan - 1 > GRID_COLS) {
      curRow++;
      curCol = 1;
    }
    cards.push({
      id: c.id,
      col: curCol,
      row: curRow,
      colSpan: newColSpan,
      rowSpan,
    });
    curCol += newColSpan;
    if (curCol > GRID_COLS) {
      curRow++;
      curCol = 1;
    }
  }

  return { cards, mode: 'scroll', totalRows: DEFAULT_TOTAL_ROWS, version: GRID_GRANULARITY };
}

function scaleLegacyLayout(layout: DashboardLayout): DashboardLayout {
  return {
    cards: layout.cards.map((card) => ({
      ...card,
      col: card.col * GRID_GRANULARITY - (GRID_GRANULARITY - 1),
      row: card.row * GRID_GRANULARITY - (GRID_GRANULARITY - 1),
      colSpan: card.colSpan * GRID_GRANULARITY,
      rowSpan: card.rowSpan * GRID_GRANULARITY,
    })),
    mode: layout.mode || 'scroll',
    totalRows: (layout.totalRows || 5) * GRID_GRANULARITY,
    version: GRID_GRANULARITY,
  };
}

export function rectsOverlap(a: GridCardConfig, b: GridCardConfig): boolean {
  return !(
    a.col + a.colSpan <= b.col ||
    b.col + b.colSpan <= a.col ||
    a.row + a.rowSpan <= b.row ||
    b.row + b.rowSpan <= a.row
  );
}

export function hasCollision(card: GridCardConfig, others: GridCardConfig[]): boolean {
  return others.some((o) => o.id !== card.id && rectsOverlap(card, o));
}

export function isInBounds(card: GridCardConfig, maxRows?: number): boolean {
  if (card.col < 1 || card.row < 1) return false;
  if (card.col + card.colSpan - 1 > GRID_COLS) return false;
  if (maxRows && card.row + card.rowSpan - 1 > maxRows) return false;
  return true;
}

export function findEmptySlot(
  cards: GridCardConfig[],
  colSpan: number,
  rowSpan: number,
): { col: number; row: number } {
  for (let r = 1; r <= 20; r++) {
    for (let c = 1; c <= GRID_COLS - colSpan + 1; c++) {
      const candidate: GridCardConfig = { id: '__test', col: c, row: r, colSpan, rowSpan };
      if (!hasCollision(candidate, cards)) {
        return { col: c, row: r };
      }
    }
  }
  return { col: 1, row: cards.length + 1 };
}

export function computeMaxRow(cards: GridCardConfig[]): number {
  let max = 0;
  for (const c of cards) {
    max = Math.max(max, c.row + c.rowSpan - 1);
  }
  return max;
}

export function computeCellDimensions(
  containerWidth: number,
  containerHeight: number,
  mode: 'fill' | 'scroll',
  totalRows: number,
) {
  const cellWidth = (containerWidth - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS;
  const cellHeight =
    mode === 'fill'
      ? (containerHeight - (totalRows - 1) * GRID_GAP) / totalRows
      : SCROLL_ROW_HEIGHT;
  return { cellWidth, cellHeight };
}

export function pointerToGrid(
  x: number,
  y: number,
  containerRect: DOMRect,
  cellWidth: number,
  cellHeight: number,
): { col: number; row: number } {
  const relX = x - containerRect.left;
  const relY = y - containerRect.top;
  const col = Math.max(1, Math.min(GRID_COLS, Math.round(relX / (cellWidth + GRID_GAP)) + 1));
  const row = Math.max(1, Math.round(relY / (cellHeight + GRID_GAP)) + 1);
  return { col, row };
}
