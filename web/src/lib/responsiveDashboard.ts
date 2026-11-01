import type { GridCardConfig } from './gridLayout';

/**
 * Preset geometry for the medium tier (720px–1119px of dashboard content).
 * The stored 24-column layout still decides which cards exist; this preset
 * decides where they go and how tall they start.
 */
export const MEDIUM_CARD_LAYOUT = {
  briefing:         { colSpan: 12, minHeight: 132 },
  'day-calendar':   { colSpan: 6,  minHeight: 360 },
  chores:           { colSpan: 6,  minHeight: 360 },
  'sanders-cash':   { colSpan: 6,  minHeight: 280 },
  weather:          { colSpan: 6,  minHeight: 280 },
  'week-calendar':  { colSpan: 12, minHeight: 420 },
  'month-calendar': { colSpan: 12, minHeight: 420 },
  tasks:            { colSpan: 4,  minHeight: 220 },
  services:         { colSpan: 4,  minHeight: 220 },
  media:            { colSpan: 4,  minHeight: 220 },
} as const;

export type MediumCardId = keyof typeof MEDIUM_CARD_LAYOUT;

/** Medium order is exactly the declaration order of MEDIUM_CARD_LAYOUT above. */
export const MEDIUM_CARD_ORDER = Object.keys(MEDIUM_CARD_LAYOUT) as MediumCardId[];

export const MEDIUM_GRID_COLS = 12;

export const DASHBOARD_PULSE_CLASS: Record<string, string> = {
  red: 'animate-subtle-pulse animate-subtle-pulse--red',
  peach: 'animate-subtle-pulse',
  pink: 'animate-subtle-pulse animate-subtle-pulse--pink',
};

/**
 * Compact (phone) order, unchanged from the previous mobile dashboard.
 * Previously declared in Home.tsx as MOBILE_CARD_ORDER.
 */
export const COMPACT_CARD_ORDER = [
  'briefing', 'day-calendar', 'sanders-cash', 'chores', 'weather',
  'week-calendar', 'month-calendar', 'tasks', 'services', 'media',
] as const;

/**
 * Order preset cards by `order`, keeping only IDs that exist in the saved
 * layout. Cards outside the preset are not rendered in the flow tiers.
 */
export function filterCardOrder<T extends string>(order: readonly T[], cards: GridCardConfig[]): T[] {
  const present = new Set(cards.map((card) => card.id));
  return order.filter((id) => present.has(id));
}
