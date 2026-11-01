import { useEffect, useState, type ReactNode } from 'react';
import { type DashboardLayout, GRID_COLS, GRID_GAP_VAR, SCROLL_ROW_HEIGHT, computeMaxRow } from '../../lib/gridLayout';

interface DashboardGridProps {
  layout: DashboardLayout;
  /**
   * Effective render mode. It can differ from `layout.mode` when a `fill`
   * layout is temporarily rendered with scroll row sizing because the
   * available height is too short. Callers must pass the same value they give
   * to `GridCard` so drag math matches the rendered geometry.
   */
  mode: 'fill' | 'scroll';
  editing: boolean;
  children: ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function DashboardGrid({ layout, mode, editing, children, containerRef }: DashboardGridProps) {
  const [height, setHeight] = useState<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const maxRow = computeMaxRow(layout.cards);
  const fillRows = Math.max(maxRow, layout.totalRows);
  const rows = mode === 'fill' ? fillRows : Math.max(maxRow, 1);

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
    gridTemplateRows:
      mode === 'fill'
        ? `repeat(${fillRows}, 1fr)`
        : `repeat(${rows}, ${SCROLL_ROW_HEIGHT}px)`,
    // Single source of truth for the gap; drag math reads the same property
    // back as a number (see readGridGap).
    gap: `var(${GRID_GAP_VAR})`,
    position: 'relative',
    height: mode === 'fill' ? '100%' : undefined,
  };

  return (
    <div ref={containerRef} className="relative h-full" style={gridStyle}>
      {/* Grid lines in edit mode */}
      {editing && height > 0 && <GridLines rows={rows} mode={mode} totalRows={layout.totalRows} />}
      {children}
    </div>
  );
}

function GridLines({ rows, mode, totalRows }: { rows: number; mode: 'fill' | 'scroll'; totalRows: number }) {
  const effectiveRows = mode === 'fill' ? totalRows : rows;
  const cells: { col: number; row: number }[] = [];
  for (let r = 1; r <= effectiveRows; r++) {
    for (let c = 1; c <= GRID_COLS; c++) {
      cells.push({ col: c, row: r });
    }
  }

  return (
    <>
      {cells.map(({ col, row }) => (
        <div
          key={`${col}-${row}`}
          className="rounded-xl border border-dashed border-surface-lighter/40 pointer-events-none"
          style={{
            gridColumn: `${col} / span 1`,
            gridRow: `${row} / span 1`,
          }}
        />
      ))}
    </>
  );
}
