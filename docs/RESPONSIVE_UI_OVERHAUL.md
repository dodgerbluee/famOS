# Responsive UI and Theme Overhaul

This document is the implementation specification. Follow it in order. Do not improvise new breakpoints, replace application behavior, or rewrite the dashboard persistence format.

## 1. Objective

Modernize the existing dark UI and make useful use of the full viewport across:

| Reference device | Test viewport (CSS pixels) | Expected mode |
|---|---:|---|
| Small phone (regression coverage) | 390 × 844 | Compact, bottom navigation |
| iPad mini portrait | 744 × 1133 | Compact, bottom navigation |
| iPad mini landscape | 1133 × 744 | Medium, navigation rail, scrolling dashboard |
| 12.9/13-inch iPad portrait | 1024 × 1366 | Medium, navigation rail, scrolling dashboard |
| 12.9/13-inch iPad landscape | 1366 × 1024 | Wide, navigation rail, editable dashboard |
| 17-inch laptop | 1440 × 900 and 1920 × 1080 | Wide, navigation rail, editable dashboard |
| 27-inch monitor | 2560 × 1440 | Wide, navigation rail, editable dashboard with modest type scaling |

The UI must be based on available CSS pixels and container size, not device names or user-agent detection.

## 2. Current implementation audit

The existing implementation has good foundations: semantic dark colors, consistent rounded cards, 44–48px touch targets in most forms, permission-filtered navigation, container wrappers in dashboard cards, and a customizable home layout.

The following structural problems must be corrected:

1. `web/src/hooks/useIsMobile.ts` recognizes only two states separated at 768px.
2. At 768px, `web/src/pages/Home.tsx` switches directly from a one-column list to the 24-column desktop editor. This makes iPads use desktop geometry.
3. `web/src/lib/gridLayout.ts` has one 24 × 20 layout for every non-mobile display. Its 16px gap is repeated between all 24 logical columns and 20 rows.
4. `web/src/components/layout/Shell.tsx` spends space on a 96px rail, floating header margins, outer main padding, a bordered outer surface, page padding, and then card padding.
5. `Home.tsx`, `Calendar.tsx`, and `Weather.tsx` compensate for the shell with `-m-4`. This is fragile and causes inconsistent spacing.
6. The shell owns hidden overflow while several descendants also own scrolling. Scroll ownership is unclear.
7. `Weather.tsx` is a rigid desktop-only composition (`1fr auto`, two columns, a 3 × 3 conditions grid) with `overflow-hidden`; content can become inaccessible at tablet sizes.
8. The mobile navigation displays every permitted route in equal-width columns. Seven destinations are too dense on narrow screens.
9. Typography and spacing stay fixed on a 27-inch 1440p/4K monitor, so the layout grows while information remains visually small.
10. Global `user-select: none` prevents normal text selection. `.safe-bottom` and `.scrollbar-hide` are used but not defined.
11. Most page layouts use the same `md` breakpoint rather than responding to the space their component actually receives.
12. List pages such as Tasks and Chores become very long single columns on wide displays instead of using available horizontal space.

## 3. Responsive model

Use these three layout tiers everywhere. Tailwind defaults may still be used for minor styling, but structural behavior must follow these values.

```ts
export const layoutQueries = {
  medium: '(min-width: 48rem)',      // 768px
  rail: '(min-width: 56.25rem)',     // 900px
  wide: '(min-width: 75rem)',        // 1200px
  largeCanvas: '(min-width: 120rem) and (min-height: 62.5rem)', // 1920 × 1000
} as const;
```

### Compact: below 900px viewport width

- Fixed bottom navigation.
- No left rail.
- Home is a one-column flow below 720px and a two-column flow from 720px through 899px when card width permits.
- Dashboard editing is unavailable. Card order and visibility still come from the saved desktop layout.
- Pages scroll vertically in the shell.
- At 600px and above, all seven main navigation items may be shown. Below 600px, show Home, Calendar, Chores, Cash, and More.

### Medium: 900px through 1199px viewport width

- 72px left navigation rail.
- 56px top bar.
- Home uses a 12-column, intrinsic-height, scrolling dashboard preset.
- No freeform drag/resize editor.
- This is the mode for iPad mini landscape and large iPad portrait.

### Wide: 1200px and above viewport width

- 76px left navigation rail; 80px on a large canvas.
- 56px top bar.
- Home uses the existing persisted 24-column layout and supports drag/resize.
- `fill` mode is allowed only when the dashboard content area is at least 720px tall. If it is shorter, render the same layout in scrolling mode for that session without changing the saved preference.
- On canvases at least 1920 × 1000, increase the root font size from 16px to 18px. Do not exceed 18px.

The 900px navigation threshold and 1200px dashboard threshold are intentionally different.

## 4. Theme direction

Keep the dark, calm household-dashboard identity, but replace the near-black-on-near-black palette with a slightly cool neutral system. Color names in components must describe purpose, not a physical shade.

Define these tokens in `web/src/index.css` under `@theme`:

```css
--color-canvas: #090b10;
--color-panel: #11151c;
--color-panel-raised: #171c25;
--color-panel-hover: #202735;
--color-border: #293242;
--color-border-subtle: #202734;

--color-ink: #f4f7fb;
--color-ink-muted: #a3adbd;
--color-ink-faint: #737f91;

--color-brand: #7c83ff;
--color-brand-strong: #6366f1;
--color-brand-soft: #a5a9ff;

--color-positive: #72d6a0;
--color-negative: #ff7f96;
--color-warning: #f4c76b;
--color-info: #78b7ff;
--color-highlight: #e99be0;
```

During migration, keep aliases for the current classes so the UI never becomes partially unstyled:

```css
--color-bg: var(--color-canvas);
--color-surface: var(--color-panel);
--color-surface-light: var(--color-panel-raised);
--color-surface-lighter: var(--color-panel-hover);
--color-text: var(--color-ink);
--color-text-dim: var(--color-ink-muted);
--color-text-bright: var(--color-ink);
--color-primary: var(--color-brand);
--color-primary-light: var(--color-brand-soft);
--color-primary-dark: var(--color-brand-strong);
```

Use the following visual rules:

- Canvas: subtle, non-animated radial tint behind the upper-left portion of the app. Do not use glassmorphism on ordinary cards.
- Page panels: `panel`; dashboard cards: `panel-raised`; hover/selected states: `panel-hover`.
- Borders: 1px `border-subtle` by default; `border` only for emphasis.
- Radius hierarchy: 10px controls, 14px cards, 18px dialogs. Do not make every element `rounded-2xl`.
- Shadows: only menus, dialogs, alerts, and the active dragged card. Ordinary cards should not have shadows.
- Body font: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Tabular values such as time, money, and temperatures use `font-variant-numeric: tabular-nums`.
- Base body copy is 14px; never use text below 11px for information a person must read.
- Keep semantic red/green/yellow/blue meanings; never communicate state by color alone.
- Motion duration: 120ms for pressed/hover state and 180ms for overlays. Disable nonessential transitions under `prefers-reduced-motion: reduce`.
- Add a visible `:focus-visible` 2px brand outline with a 2px offset.

## 5. Global CSS and primitives

### `web/src/index.css`

1. Add the semantic tokens and compatibility aliases above.
2. Change `html, body, #root` to `min-height: 100%; height: 100dvh` and retain `overflow: hidden` only because the shell owns scrolling.
3. Remove `user-select: none` from the document root. Apply `user-select: none` only to navigation, drag handles, and icon buttons.
4. Define:

```css
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
.safe-top { padding-top: env(safe-area-inset-top); }
.scrollbar-hide { scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
.tabular-nums { font-variant-numeric: tabular-nums; }
```

5. Add root layout variables:

```css
:root {
  --shell-gap: clamp(0.5rem, 0.7vw, 0.875rem);
  --page-gutter: clamp(0.75rem, 1.2vw, 1.5rem);
  --card-gap: clamp(0.625rem, 0.9vw, 1rem);
  --topbar-height: 3.5rem;
  --rail-width: 4.5rem;
}
```

6. At 1200px set `--rail-width: 4.75rem`; at 1920 × 1000 set it to `5rem` and set `html { font-size: 18px; }`.
7. Add reduced-motion and focus-visible rules.

### Add `web/src/components/layout/Page.tsx`

Create three simple components. They must accept `className` and standard div/header props.

- `Page`: `min-h-full`, normal vertical page padding, and one page-level scroll flow.
- `PageHeader`: responsive title/actions wrapper that stacks below 640px.
- `Surface`: semantic panel border/background/radius wrapper.

Do not add a component library. These primitives only centralize repeated shell geometry.

## 6. Application shell

Modify `web/src/components/layout/Shell.tsx` and `NavBar.tsx`.

### Required shell structure

```text
AppShell (100dvh, canvas background)
├── NavRail (>= 900px only)
└── ShellColumn
    ├── TopBar (56px plus safe-area inset)
    ├── MainScrollRegion
    │   └── route content (no universal outer card)
    └── BottomNav (< 900px only)
```

- Remove the universal bordered/rounded surface around every route at `Shell.tsx:129`.
- Remove sticky offsets and floating margins from the top bar. It is a normal fixed-height row in the shell column.
- Top bar horizontal padding is `--page-gutter`.
- Main has `min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain`.
- Main must not add page padding itself. `Page` and full-canvas routes decide their own padding.
- Home, Calendar, and Weather are full-canvas routes and fill the available region without negative margins.
- The top bar contains the brand at left and account/edit actions at right. Preserve every current action and permission check.
- At compact widths, truncate the family member name before hiding or overflowing action buttons.

### Navigation

- Rail width comes from `--rail-width`; remove `w-24`.
- Rail items are at least 48px high and have icon + label. Active state uses a brand-tinted pill and a 3px indicator on its left edge.
- Bottom nav is 60px plus `env(safe-area-inset-bottom)`.
- Bottom-nav controls are at least 48 × 48px.
- Below 600px, render five slots: Home, Calendar, Chores, Cash, More. `More` opens an accessible modal sheet containing all remaining permitted destinations plus Settings when permitted.
- At 600–899px, render all permitted primary routes.
- The More slot appears active when the current route is inside it.
- Modal sheet requirements: `role="dialog"`, `aria-modal="true"`, Escape closes it, focus moves into it when opened, focus returns to More when closed, and backdrop click closes it.

## 7. Dashboard

Preserve the existing API setting key (`home_layout`) and `DashboardLayout` JSON shape. The stored 24-column layout remains the source for visibility, wide-screen placement, and compact ordering.

### Add `web/src/hooks/useLayoutTier.ts`

Return `'compact' | 'medium' | 'wide'` from a supplied container ref using `ResizeObserver`, not `window.innerWidth`.

- compact: container width below 720px
- medium: 720px through 1119px
- wide: 1120px or wider

These are content-container thresholds, intentionally smaller than shell viewport thresholds.

### Add `web/src/lib/responsiveDashboard.ts`

Export a medium preset by card ID:

```ts
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
```

Medium card order is exactly the order above, filtered to IDs present in `layout.cards`.

Compact order remains the existing `MOBILE_CARD_ORDER`, filtered to saved cards. At 720–1119px, use the medium preset. Below 720px, use one column.

### Modify `Home.tsx`

- Replace `useIsMobile` with `useLayoutTier` measured from the home content area.
- Render three explicit branches: compact flow, medium preset grid, wide editable grid.
- Compact cards use intrinsic height. Do not put calendar/weather content into a fixed-height box that clips it.
- Medium uses `grid-template-columns: repeat(12, minmax(0, 1fr))`, the preset spans above, and intrinsic row sizing.
- Wide keeps `DashboardGrid`/`GridCard` and all current persistence/editing behavior.
- Show the edit action only in wide mode.
- If the viewport changes while editing and leaves wide mode, call `setEditing(false)` without modifying the saved layout.
- Remove `-m-4` and hardcoded compensating padding.
- Keep data fetching, WebSocket behavior, card visibility, pulse states, navigation, and skeletons unchanged.

### Modify `DashboardGrid.tsx`, `GridCard.tsx`, and `gridLayout.ts`

- Change `GRID_GAP` from a fixed exported constant used for rendering to a numeric value read from one shared CSS custom property. Drag calculations and rendered gap must always use the same pixel value.
- Use an 8–12px effective gap below 1440px and a 16px gap at 1440px and above.
- In wide fill mode, if available height is below 720px, use scroll row sizing for rendering only. Do not persist this automatic fallback.
- Card radius is 14px.
- Card content padding: 10px under 420px card width, 14px at 420px and above, 18px at 700px and above. Implement with CSS container queries on the existing `@container` wrapper.
- Keep all drag collision and migration behavior. Do not rewrite `migrateLayout`, IDs, or backend storage.
- Editing controls must be at least 32px on pointer-coarse devices even if their visible glyph is smaller.

## 8. Route-specific layouts

### Calendar — `pages/Calendar.tsx` and calendar view components

- Remove `-m-4`; use a full-canvas flex column with `--page-gutter`.
- Toolbar wraps without horizontal overflow. On widths below 640px, title/navigation occupies row one and mode/actions row two.
- Default view by calendar content width: day below 720px, week from 720–1099px, month at 1100px and above.
- Re-evaluate the automatic default when the container crosses a tier only until the person manually chooses a view. After manual selection, preserve their choice during that mount.
- Week view uses its compact agenda presentation below 760px of component width, not based on global viewport width.
- Month remains selectable at every width; its grid may horizontally scroll with a minimum internal width of 700px rather than crushing labels.
- There must be one scrolling region for the current calendar view, not nested page and card scrollbars.

### Weather — `pages/Weather.tsx`

- Remove `overflow-hidden`, `-m-4`, and the assumption that all sections fit vertically.
- Below 768px: current conditions stack; sun times remain a horizontal row; hourly forecast scrolls horizontally; forecast and conditions are one column; condition tiles use two columns.
- 768–1199px: top area may wrap; bottom uses `minmax(320px, 0.9fr) minmax(0, 1.1fr)`; condition tiles use two columns.
- 1200px and above: retain the two-column bottom composition; condition tiles use three columns.
- Hourly entries have a minimum width of 52px and live in an overflow-x strip. Do not squeeze 12 entries with `justify-between`.
- Page scroll must expose every forecast and condition at 744 × 1133 and 1133 × 744.

### Cameras — `pages/Cameras.tsx`, `components/cameras/CameraGrid.tsx`

- Camera grid uses `repeat(auto-fit, minmax(min(100%, 300px), 1fr))`.
- Raise minimum tile width to 360px on canvases at least 1600px wide.
- Cap at four columns; do not create five or more tiny streams on a 27-inch display.
- Keep aspect ratio stable at 16:9 and preserve stream, fit-mode, drag-order, and fullscreen behavior.
- Header uses `PageHeader` and wraps actions on compact screens.

### Chores and Tasks

- Use `Page` and `PageHeader`.
- Header title/description and primary action stack below 640px. The button must not force description text into a narrow sliver.
- Chore groups use `repeat(auto-fit, minmax(min(100%, 340px), 1fr))` at 900px and above. Keep each family member's heading attached to its grid.
- Tasks uses one column below 1100px. At 1100px and above, pending and completed sections sit in a `minmax(0, 1.4fr) minmax(280px, 0.6fr)` grid.
- Forms remain full-width below 768px and are limited to a readable 720px width on larger screens.

### Sanders Cash and Reward Store

- Account/reward cards use auto-fit grids with a 240px minimum, maximum four columns at normal desktop scale, and maximum five columns at 1920px and above.
- Detail/history text columns should not stretch beyond 900px; use remaining width for summary/actions rather than wider lines.
- Preserve all monetary behavior and modal flows.

### Settings

- Below 1100px, keep horizontally scrollable tabs.
- At 1100px and above, render tabs as a sticky 220px vertical sidebar and active content in `minmax(0, 1fr)`.
- Settings content may use the full remaining width, but forms should use two columns only where both controls remain at least 280px wide.
- Preserve permissions and existing tab state.

### Authentication, setup, pairing, and dialogs

- Keep centered cards and existing max widths.
- Use `100dvh`, safe-area padding, new semantic tokens, and 18px dialog radius.
- Mobile dialogs remain bottom sheets; at 640px and above they are centered dialogs.
- No functional flow changes are part of this overhaul.

## 9. Accessibility and interaction requirements

- Every icon-only control receives an `aria-label`; `title` alone is insufficient.
- Touch targets are at least 44 × 44px. Navigation targets are at least 48 × 48px.
- Hover styling must be wrapped in `@media (hover: hover)` or paired with an equivalent focus/active state.
- Drag-only dashboard operations retain the current simple preset and card removal/add controls; do not require drag on touch-only medium devices.
- Text contrast target: WCAG AA (4.5:1 for normal text, 3:1 for large text and UI boundaries).
- Focus must not be clipped by card `overflow: hidden`.
- Respect top/bottom safe areas in standalone iPad/PWA mode.
- No essential content may be hidden solely to make a viewport fit.

## 10. Implementation order

Complete and verify each phase before starting the next.

1. **Tokens and global CSS** — `index.css`; no route layout changes yet.
2. **Page primitives and shell** — `Page.tsx`, `Shell.tsx`, `NavBar.tsx`; remove universal outer surface.
3. **Responsive measurement** — add `useLayoutTier.ts`; do not reuse the binary `useIsMobile` hook for new work.
4. **Dashboard branches** — compact, medium preset, wide persisted editor.
5. **Full-canvas routes** — Calendar and Weather; remove negative margins.
6. **Content routes** — Cameras, Chores, Tasks, Sanders Cash, Reward Store, Settings.
7. **Dialogs/auth polish** — semantic tokens, safe areas, focus behavior.
8. **Regression and viewport verification**.

After all call sites are migrated, delete `web/src/hooks/useIsMobile.ts` only if it has no remaining imports.

## 11. Verification checklist

Run:

```bash
cd web
npm run lint
npm run build
```

Manually inspect every reference viewport from section 1 in both normal and kiosk roles where possible.

At each viewport verify:

- No horizontal page scrollbar (except the intentional month-calendar and hourly-weather inner strips).
- No clipped card, toolbar, menu, toast, or modal content.
- Exactly one obvious vertical page scroller.
- Navigation is reachable, permission filtered, and active state is correct.
- iPad mini portrait uses compact dashboard flow.
- iPad mini landscape and large iPad portrait use the medium dashboard preset, not the 24-column editor.
- 17-inch and larger landscapes expose dashboard editing.
- 2560 × 1440 uses larger but not oversized type and no empty max-width gutter around the dashboard.
- Rotating between portrait and landscape changes layout without requiring reload.
- Leaving wide mode while editing safely exits edit mode.
- Saved dashboard JSON still loads, migrates, persists, and returns unchanged after a wide-screen edit.
- Calendar defaults correctly by available width and manual view choice is not unexpectedly overwritten.
- Weather content is fully reachable at 744 × 1133 and 1133 × 744.
- Bottom navigation does not collide with iOS/iPadOS home indicators.
- Keyboard focus, Escape-to-close, reduced motion, and touch targets work.

## 12. Explicit non-goals and guardrails

- Do not modify Go APIs, database tables, routes, permissions, polling, WebSocket behavior, or query caching.
- Do not rename card IDs or the `home_layout` setting.
- Do not add a third-party component framework, grid library, icon library, or runtime CSS-in-JS package.
- Do not detect specific devices or use user-agent sniffing.
- Do not solve clipping with smaller-than-11px text.
- Do not place a max-width wrapper around the dashboard, calendar, weather, or cameras pages.
- Do not remove data, actions, edit controls, or navigation destinations to make layouts fit.
- Do not globally scale the application with CSS `transform` or browser zoom.
- Do not combine this work with unrelated data/model refactors.
