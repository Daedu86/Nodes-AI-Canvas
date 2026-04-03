"use client";

import React from "react";
import { useWorkspaceSplitState } from "@/components/context/session-ui-state";

type WorkspaceSplitLayoutProps = {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
};

export function WorkspaceSplitLayout({
  leftPanel,
  rightPanel,
}: WorkspaceSplitLayoutProps) {
  const { splitRatio, setSplitRatio, viewMode } = useWorkspaceSplitState();
  const splitRef = React.useRef<HTMLDivElement | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);
  const resizingRef = React.useRef(false);

  const clampFraction = React.useCallback((value: number, containerWidth?: number) => {
    if (!containerWidth || containerWidth <= 0) {
      return Math.min(0.8, Math.max(0.2, value));
    }
    const minPanelWidth = 260;
    const handleWidth = 8;
    const usableWidth = Math.max(containerWidth - handleWidth, 1);
    const minFraction = Math.min(0.5, minPanelWidth / usableWidth);
    const maxFraction = Math.max(minFraction, 1 - minFraction);
    const clamped = Math.min(maxFraction, Math.max(minFraction, value));
    return Number.isFinite(clamped) ? clamped : minFraction;
  }, []);

  React.useEffect(() => {
    const clampToWidth = () => {
      const width = splitRef.current?.getBoundingClientRect().width ?? 0;
      setSplitRatio((prev) => clampFraction(prev, width));
    };
    clampToWidth();
    window.addEventListener("resize", clampToWidth);
    return () => window.removeEventListener("resize", clampToWidth);
  }, [clampFraction, setSplitRatio]);

  React.useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  const updateSplitFromPointer = React.useCallback(
    (clientX: number) => {
      if (!splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relative = (clientX - rect.left) / rect.width;
      setSplitRatio(clampFraction(relative, rect.width));
    },
    [clampFraction, setSplitRatio],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!splitRef.current) return;
    resizingRef.current = true;
    pointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    document.body.style.cursor = "col-resize";
    updateSplitFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current || pointerIdRef.current !== e.pointerId) return;
    updateSplitFromPointer(e.clientX);
  };

  const stopResizing = (e?: React.PointerEvent<HTMLDivElement>) => {
    resizingRef.current = false;
    pointerIdRef.current = null;
    document.body.style.cursor = "";
    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleSeparatorDoubleClick = () => {
    const width = splitRef.current?.getBoundingClientRect().width ?? 0;
    setSplitRatio(clampFraction(0.6, width));
  };

  const handleSeparatorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const width = splitRef.current?.getBoundingClientRect().width ?? 0;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSplitRatio((prev) => clampFraction(prev - 0.03, width));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSplitRatio((prev) => clampFraction(prev + 0.03, width));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSplitRatio(clampFraction(0.3, width));
    } else if (e.key === "End") {
      e.preventDefault();
      setSplitRatio(clampFraction(0.7, width));
    }
  };

  const leftStyle = { flex: splitRatio, minWidth: 220 };
  const rightStyle = { flex: Math.max(0.1, 1 - splitRatio), minWidth: 220 };

  if (viewMode === "chat") {
    return (
      <div className="flex flex-1 flex-col overflow-hidden px-4 py-4">
        <div className="min-h-0 flex-1">
          {leftPanel}
        </div>
      </div>
    );
  }

  if (viewMode === "canvas") {
    return (
      <div className="flex flex-1 flex-col overflow-hidden px-4 py-4">
        <div className="min-h-0 flex-1">
          {rightPanel}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={splitRef} className="flex flex-1 min-h-0 gap-3 px-4 py-4">
        <div style={leftStyle} className="min-h-0">
          {leftPanel}
        </div>
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize panels"
          className="group relative flex h-full w-2 cursor-col-resize items-center justify-center rounded bg-border/40 outline-none transition-colors focus-visible:bg-primary/30"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopResizing}
          onPointerCancel={stopResizing}
          onLostPointerCapture={stopResizing}
          onDoubleClick={handleSeparatorDoubleClick}
          onKeyDown={handleSeparatorKeyDown}
        >
          <span className="pointer-events-none h-16 w-px rounded-full bg-border/80 transition-colors group-hover:bg-primary" />
        </div>
        <div style={rightStyle} className="min-h-0">
          {rightPanel}
        </div>
      </div>
    </div>
  );
}
