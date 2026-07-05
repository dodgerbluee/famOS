import { useRef, useEffect, useCallback, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { type GridCardConfig, GRID_COLS, CARD_MIN_SIZES, hasCollision, isInBounds, computeCellDimensions, GRID_GAP } from '../../lib/gridLayout';

interface GridCardProps {
  card: GridCardConfig;
  label: string;
  editing: boolean;
  allCards: GridCardConfig[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  gridMode: 'fill' | 'scroll';
  totalRows: number;
  onMove: (id: string, col: number, row: number) => void;
  onResize: (id: string, colSpan: number, rowSpan: number) => void;
  onRemove: (id: string) => void;
  children: ReactNode;
}

interface DragState {
  type: 'move' | 'resize-right' | 'resize-bottom' | 'resize-corner';
  startX: number;
  startY: number;
  origCol: number;
  origRow: number;
  origColSpan: number;
  origRowSpan: number;
  cellW: number;
  cellH: number;
  ghost: HTMLDivElement | null;
  ghostOffsetX: number;
  ghostOffsetY: number;
}

export function GridCard({
  card, label, editing, allCards, containerRef,
  gridMode, totalRows, onMove, onResize, onRemove, children,
}: GridCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const cardDataRef = useRef({ card, allCards, gridMode, totalRows });
  cardDataRef.current = { card, allCards, gridMode, totalRows };

  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const ds = dragRef.current;
    if (!ds) return;

    const { card: c, allCards: all, gridMode: gm, totalRows: tr } = cardDataRef.current;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    const step = ds.cellW + GRID_GAP;
    const stepY = ds.cellH + GRID_GAP;

    if (ds.type === 'move') {
      if (ds.ghost) {
        ds.ghost.style.left = `${e.clientX - ds.ghostOffsetX}px`;
        ds.ghost.style.top = `${e.clientY - ds.ghostOffsetY}px`;
      }
      const dCols = Math.round(dx / step);
      const dRows = Math.round(dy / stepY);
      const newCol = ds.origCol + dCols;
      const newRow = ds.origRow + dRows;
      const candidate: GridCardConfig = { ...c, col: newCol, row: newRow };
      if (
        isInBounds(candidate, gm === 'fill' ? tr : undefined) &&
        !hasCollision(candidate, all)
      ) {
        onMoveRef.current(c.id, newCol, newRow);
      }
    } else {
      const mins = CARD_MIN_SIZES[c.id] || { minCol: 1, minRow: 1 };
      let newColSpan = ds.origColSpan;
      let newRowSpan = ds.origRowSpan;

      if (ds.type === 'resize-right' || ds.type === 'resize-corner') {
        newColSpan = Math.max(mins.minCol, ds.origColSpan + Math.round(dx / step));
      }
      if (ds.type === 'resize-bottom' || ds.type === 'resize-corner') {
        newRowSpan = Math.max(mins.minRow, ds.origRowSpan + Math.round(dy / stepY));
      }

      newColSpan = Math.min(newColSpan, GRID_COLS - c.col + 1);
      if (gm === 'fill') {
        newRowSpan = Math.min(newRowSpan, tr - c.row + 1);
      }

      const candidate: GridCardConfig = { ...c, colSpan: newColSpan, rowSpan: newRowSpan };
      if (!hasCollision(candidate, all)) {
        onResizeRef.current(c.id, newColSpan, newRowSpan);
      }
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    const ds = dragRef.current;
    if (!ds) return;
    if (ds.ghost) ds.ghost.remove();
    dragRef.current = null;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const startDrag = (e: ReactPointerEvent, type: DragState['type']) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();

    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { cellWidth, cellHeight } = computeCellDimensions(rect.width, rect.height, gridMode, totalRows);

    let ghost: HTMLDivElement | null = null;
    let ghostOffsetX = 0;
    let ghostOffsetY = 0;

    if (type === 'move' && cardRef.current) {
      ghost = document.createElement('div');
      const cardRect = cardRef.current.getBoundingClientRect();
      ghost.className = 'fixed pointer-events-none z-[100] rounded-2xl bg-primary-light/15 border-2 border-primary-light/30 backdrop-blur-sm';
      ghost.style.width = `${cardRect.width}px`;
      ghost.style.height = `${cardRect.height}px`;
      ghost.style.left = `${cardRect.left}px`;
      ghost.style.top = `${cardRect.top}px`;
      ghostOffsetX = e.clientX - cardRect.left;
      ghostOffsetY = e.clientY - cardRect.top;
      document.body.appendChild(ghost);
    }

    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      origCol: card.col,
      origRow: card.row,
      origColSpan: card.colSpan,
      origRowSpan: card.rowSpan,
      cellW: cellWidth,
      cellH: cellHeight,
      ghost,
      ghostOffsetX,
      ghostOffsetY,
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const style: React.CSSProperties = {
    gridColumn: `${card.col} / span ${card.colSpan}`,
    gridRow: `${card.row} / span ${card.rowSpan}`,
  };

  return (
    <div
      ref={cardRef}
      className={`bg-surface rounded-2xl relative overflow-hidden ${
        editing ? 'ring-1 ring-surface-lighter' : ''
      }`}
      style={style}
    >
      {editing && (
        <>
          {/* Drag handle — full-width top bar */}
          <div
            onPointerDown={(e) => startDrag(e, 'move')}
            className="absolute top-0 inset-x-0 h-8 z-10 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
          >
            <div className="flex gap-0.5">
              {[...Array(6)].map((_, i) => (
                <span key={i} className="w-1 h-1 rounded-full bg-text-dim/50" />
              ))}
            </div>
          </div>

          {/* Label + size badge */}
          <div className="absolute top-1 left-2 z-10 flex items-center gap-1.5 pointer-events-none">
            <span className="text-[10px] text-text-dim font-medium">{label}</span>
            <span className="text-[9px] text-text-dim/70 bg-surface-lighter/50 px-1 rounded">
              {card.colSpan}×{card.rowSpan}
            </span>
          </div>

          {/* Remove button */}
          <button
            onClick={() => onRemove(card.id)}
            className="absolute top-1 right-2 z-10 w-5 h-5 flex items-center justify-center rounded-full text-accent-red/60 hover:text-accent-red text-xs"
          >
            ×
          </button>

          {/* Right resize handle */}
          <div
            onPointerDown={(e) => startDrag(e, 'resize-right')}
            className="absolute right-0 top-2 bottom-2 w-3 cursor-col-resize z-10 touch-none select-none group"
          >
            <div className="h-full w-0.5 mx-auto rounded-full bg-text-dim/20 group-hover:bg-primary-light/50 transition-colors" />
          </div>

          {/* Bottom resize handle */}
          <div
            onPointerDown={(e) => startDrag(e, 'resize-bottom')}
            className="absolute bottom-0 left-2 right-2 h-3 cursor-row-resize z-10 touch-none select-none group"
          >
            <div className="w-full h-0.5 my-auto rounded-full bg-text-dim/20 group-hover:bg-primary-light/50 transition-colors" />
          </div>

          {/* Corner resize handle */}
          <div
            onPointerDown={(e) => startDrag(e, 'resize-corner')}
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-10 touch-none select-none group"
          >
            <svg className="absolute bottom-1 right-1 w-3 h-3 text-text-dim/30 group-hover:text-primary-light/60 transition-colors" viewBox="0 0 10 10">
              <path d="M9 1v8H1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}

      {/* Card content */}
      <div className={`h-full overflow-y-auto ${editing ? 'p-4 pt-8' : 'p-5'}`}>
        {children}
      </div>
    </div>
  );
}
