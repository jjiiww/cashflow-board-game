import React, { useRef, useState } from 'react';

interface ResizeHandleProps {
  /** 'vertical' splits left/right panes (drag horizontally); 'horizontal' splits top/bottom panes (drag vertically) */
  orientation: 'vertical' | 'horizontal';
  onDragStart: () => void;
  onDragMove: (deltaPx: number) => void;
  onDoubleClick?: () => void;
  title?: string;
  className?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  orientation,
  onDragStart,
  onDragMove,
  onDoubleClick,
  title,
  className = '',
}) => {
  const [dragging, setDragging] = useState(false);
  const startCoordRef = useRef(0);

  const isVertical = orientation === 'vertical';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startCoordRef.current = isVertical ? e.clientX : e.clientY;
    setDragging(true);
    onDragStart();

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const current = isVertical ? moveEvent.clientX : moveEvent.clientY;
      onDragMove(current - startCoordRef.current);
    };

    const handlePointerUp = () => {
      setDragging(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      title={title}
      onPointerDown={handlePointerDown}
      onDoubleClick={onDoubleClick}
      className={`group relative select-none touch-none items-center justify-center transition-colors ${
        isVertical
          ? 'w-2.5 -mx-[5px] h-full cursor-col-resize'
          : 'h-2.5 -my-[5px] w-full cursor-row-resize'
      } ${className}`}
    >
      {/* Subtle full-length highlight line on hover/drag */}
      <div
        className={`transition-colors pointer-events-none ${
          isVertical ? 'w-[2px] h-full' : 'h-[2px] w-full'
        } ${
          dragging
            ? 'bg-orange-500'
            : 'bg-transparent group-hover:bg-orange-400/80'
        }`}
      />
      {/* Centered grip pill */}
      <div
        className={`absolute rounded-full pointer-events-none transition-all ${
          isVertical ? 'w-1 h-10' : 'h-1 w-10'
        } ${
          dragging
            ? 'bg-orange-500 shadow-xs scale-110'
            : 'bg-slate-300/90 group-hover:bg-orange-400'
        }`}
      />
    </div>
  );
};
