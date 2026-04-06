"use client";

import React from "react";
import { useWorkspaceSplitState } from "@/components/context/session-ui-state";

type WorkspaceSplitLayoutProps = {
  chatPanel: React.ReactNode;
  canvasPanel: React.ReactNode;
  wikiPanel: React.ReactNode;
  nodyPanel: React.ReactNode;
};

const MIN_PANEL_WIDTH = 260;
const HANDLE_WIDTH = 8;
const PANEL_GAP = 18;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const shellClassName =
  "overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.86))] shadow-[0_28px_90px_-48px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.04] backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(15,23,42,0.82))] dark:ring-white/[0.03]";
const shellInnerClassName =
  "h-full min-h-0 overflow-hidden rounded-[26px] bg-background/90 dark:bg-slate-950/80";

const WorkspacePanelShell = ({ children }: { children: React.ReactNode }) => (
  <div className={shellClassName}>
    <div className={shellInnerClassName}>{children}</div>
  </div>
);

const getPanelWidths = (
  containerWidth: number,
  splitRatio: number,
  secondarySplitRatio: number,
) => {
  const chromeWidth = HANDLE_WIDTH * 2 + PANEL_GAP * 4;
  const usableWidth = Math.max(containerWidth - chromeWidth, MIN_PANEL_WIDTH * 3);
  const leftWidth = clamp(splitRatio * usableWidth, MIN_PANEL_WIDTH, usableWidth - MIN_PANEL_WIDTH * 2);
  const remainingWidth = Math.max(usableWidth - leftWidth, MIN_PANEL_WIDTH * 2);
  const middleWidth = clamp(
    secondarySplitRatio * remainingWidth,
    MIN_PANEL_WIDTH,
    remainingWidth - MIN_PANEL_WIDTH,
  );
  const rightWidth = Math.max(MIN_PANEL_WIDTH, remainingWidth - middleWidth);

  return {
    leftWidth,
    middleWidth,
    rightWidth,
    usableWidth,
  };
};

type ResizeHandle = "primary" | "secondary";

export function WorkspaceSplitLayout({
  chatPanel,
  canvasPanel,
  wikiPanel,
  nodyPanel,
}: WorkspaceSplitLayoutProps) {
  const {
    splitRatio,
    setSplitRatio,
    secondarySplitRatio,
    setSecondarySplitRatio,
    viewMode,
  } = useWorkspaceSplitState();
  const splitRef = React.useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const pointerIdRef = React.useRef<number | null>(null);
  const resizingHandleRef = React.useRef<ResizeHandle | null>(null);

  const clampPrimaryRatio = React.useCallback((value: number, containerWidth?: number) => {
    if (!containerWidth || containerWidth <= 0) {
      return Math.min(0.7, Math.max(0.22, value));
    }
    const chromeWidth = HANDLE_WIDTH * 2 + PANEL_GAP * 4;
    const usableWidth = Math.max(containerWidth - chromeWidth, MIN_PANEL_WIDTH * 3);
    return clamp(value, MIN_PANEL_WIDTH / usableWidth, (usableWidth - MIN_PANEL_WIDTH * 2) / usableWidth);
  }, []);

  const clampSecondaryRatio = React.useCallback(
    (value: number, containerWidth?: number, primaryRatio?: number) => {
      if (!containerWidth || containerWidth <= 0) {
        return Math.min(0.7, Math.max(0.3, value));
      }
      const chromeWidth = HANDLE_WIDTH * 2 + PANEL_GAP * 4;
      const usableWidth = Math.max(containerWidth - chromeWidth, MIN_PANEL_WIDTH * 3);
      const leftWidth = clampPrimaryRatio((primaryRatio ?? splitRatio), containerWidth) * usableWidth;
      const remainingWidth = Math.max(usableWidth - leftWidth, MIN_PANEL_WIDTH * 2);
      return clamp(value, MIN_PANEL_WIDTH / remainingWidth, (remainingWidth - MIN_PANEL_WIDTH) / remainingWidth);
    },
    [clampPrimaryRatio, splitRatio],
  );

  React.useEffect(() => {
    const clampToWidth = () => {
      const width = splitRef.current?.getBoundingClientRect().width ?? 0;
      setContainerWidth(width);
      setSplitRatio((prev) => clampPrimaryRatio(prev, width));
      setSecondarySplitRatio((prev) => clampSecondaryRatio(prev, width));
    };
    clampToWidth();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const entry = entries[0];
            const nextWidth = entry?.contentRect.width ?? splitRef.current?.getBoundingClientRect().width ?? 0;
            setContainerWidth(nextWidth);
            setSplitRatio((prev) => clampPrimaryRatio(prev, nextWidth));
            setSecondarySplitRatio((prev) => clampSecondaryRatio(prev, nextWidth));
          })
        : null;
    if (observer && splitRef.current) {
      observer.observe(splitRef.current);
    }
    window.addEventListener("resize", clampToWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", clampToWidth);
    };
  }, [clampPrimaryRatio, clampSecondaryRatio, setSecondarySplitRatio, setSplitRatio]);

  React.useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  const updateSplitFromPointer = React.useCallback(
    (clientX: number) => {
      if (!splitRef.current || !resizingHandleRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      if (resizingHandleRef.current === "primary") {
        const chromeWidth = HANDLE_WIDTH * 2 + PANEL_GAP * 4;
        const usableWidth = Math.max(rect.width - chromeWidth, MIN_PANEL_WIDTH * 3);
        const leftWidth = clamp(
          clientX - rect.left,
          MIN_PANEL_WIDTH,
          usableWidth - MIN_PANEL_WIDTH * 2,
        );
        const nextPrimaryRatio = clampPrimaryRatio(leftWidth / usableWidth, rect.width);
        setSplitRatio(nextPrimaryRatio);
        setSecondarySplitRatio((prev) =>
          clampSecondaryRatio(prev, rect.width, nextPrimaryRatio),
        );
        return;
      }

      const widths = getPanelWidths(rect.width, splitRatio, secondarySplitRatio);
      const middleStart = rect.left + widths.leftWidth + HANDLE_WIDTH;
      const nextMiddleWidth = clamp(
        clientX - middleStart,
        MIN_PANEL_WIDTH,
        widths.middleWidth + widths.rightWidth - MIN_PANEL_WIDTH,
      );
      const remainingWidth = widths.middleWidth + widths.rightWidth;
      setSecondarySplitRatio(
        clampSecondaryRatio(nextMiddleWidth / remainingWidth, rect.width, splitRatio),
      );
    },
    [
      clampPrimaryRatio,
      clampSecondaryRatio,
      secondarySplitRatio,
      setSecondarySplitRatio,
      setSplitRatio,
      splitRatio,
    ],
  );

  const handlePointerDown = (handle: ResizeHandle) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (!splitRef.current) return;
    resizingHandleRef.current = handle;
    pointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    document.body.style.cursor = "col-resize";
    updateSplitFromPointer(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingHandleRef.current || pointerIdRef.current !== event.pointerId) return;
    updateSplitFromPointer(event.clientX);
  };

  const stopResizing = (event?: React.PointerEvent<HTMLDivElement>) => {
    resizingHandleRef.current = null;
    pointerIdRef.current = null;
    document.body.style.cursor = "";
    if (event) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    }
  };

  const handleSeparatorDoubleClick = (handle: ResizeHandle) => () => {
    const width = splitRef.current?.getBoundingClientRect().width ?? 0;
    if (handle === "primary") {
      setSplitRatio(clampPrimaryRatio(0.34, width));
      return;
    }
    setSecondarySplitRatio(clampSecondaryRatio(0.5, width));
  };

  const handleSeparatorKeyDown =
    (handle: ResizeHandle) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      const width = splitRef.current?.getBoundingClientRect().width ?? 0;
      const delta = 0.03;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (handle === "primary") {
          setSplitRatio((prev) => clampPrimaryRatio(prev - delta, width));
        } else {
          setSecondarySplitRatio((prev) => clampSecondaryRatio(prev - delta, width));
        }
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (handle === "primary") {
          setSplitRatio((prev) => clampPrimaryRatio(prev + delta, width));
        } else {
          setSecondarySplitRatio((prev) => clampSecondaryRatio(prev + delta, width));
        }
      } else if (event.key === "Home") {
        event.preventDefault();
        if (handle === "primary") {
          setSplitRatio(clampPrimaryRatio(0.28, width));
        } else {
          setSecondarySplitRatio(clampSecondaryRatio(0.35, width));
        }
      } else if (event.key === "End") {
        event.preventDefault();
        if (handle === "primary") {
          setSplitRatio(clampPrimaryRatio(0.44, width));
        } else {
          setSecondarySplitRatio(clampSecondaryRatio(0.65, width));
        }
      }
    };

  const { leftWidth, middleWidth, rightWidth } = getPanelWidths(containerWidth, splitRatio, secondarySplitRatio);

  if (viewMode === "chat") {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.09),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.88),rgba(241,245,249,0.72))] px-5 py-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.1),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(2,6,23,0.78))]">
        <div className="min-h-0 flex-1">
          <WorkspacePanelShell>{chatPanel}</WorkspacePanelShell>
        </div>
      </div>
    );
  }

  if (viewMode === "canvas") {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.09),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.88),rgba(241,245,249,0.72))] px-5 py-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.1),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(2,6,23,0.78))]">
        <div className="min-h-0 flex-1">
          <WorkspacePanelShell>{canvasPanel}</WorkspacePanelShell>
        </div>
      </div>
    );
  }

  if (viewMode === "wiki") {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.09),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.88),rgba(241,245,249,0.72))] px-5 py-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.1),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(2,6,23,0.78))]">
        <div className="min-h-0 flex-1">
          <WorkspacePanelShell>{wikiPanel}</WorkspacePanelShell>
        </div>
      </div>
    );
  }

  if (viewMode === "nody") {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.09),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.88),rgba(241,245,249,0.72))] px-5 py-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.1),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(2,6,23,0.78))]">
        <div className="min-h-0 flex-1">
          <WorkspacePanelShell>{nodyPanel}</WorkspacePanelShell>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.09),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.88),rgba(241,245,249,0.72))] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.1),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(2,6,23,0.78))]">
      <div
        ref={splitRef}
        className="flex min-h-0 flex-1 px-5 py-5"
        style={{ columnGap: `${PANEL_GAP}px` }}
      >
        <div style={{ width: leftWidth, minWidth: MIN_PANEL_WIDTH }} className="min-h-0 shrink-0">
          <WorkspacePanelShell>{chatPanel}</WorkspacePanelShell>
        </div>
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize chat and canvas panels"
          className="group relative flex h-full w-2 shrink-0 cursor-col-resize items-center justify-center rounded-full bg-white/45 outline-none transition-colors focus-visible:bg-sky-400/30 dark:bg-white/10"
          onPointerDown={handlePointerDown("primary")}
          onPointerMove={handlePointerMove}
          onPointerUp={stopResizing}
          onPointerCancel={stopResizing}
          onLostPointerCapture={stopResizing}
          onDoubleClick={handleSeparatorDoubleClick("primary")}
          onKeyDown={handleSeparatorKeyDown("primary")}
        >
          <span className="pointer-events-none h-24 w-px rounded-full bg-slate-400/70 transition-colors group-hover:bg-sky-500 dark:bg-slate-500/70" />
        </div>
        <div style={{ width: middleWidth, minWidth: MIN_PANEL_WIDTH }} className="min-h-0 shrink-0">
          <WorkspacePanelShell>{canvasPanel}</WorkspacePanelShell>
        </div>
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize canvas and Nody panels"
          className="group relative flex h-full w-2 shrink-0 cursor-col-resize items-center justify-center rounded-full bg-white/45 outline-none transition-colors focus-visible:bg-sky-400/30 dark:bg-white/10"
          onPointerDown={handlePointerDown("secondary")}
          onPointerMove={handlePointerMove}
          onPointerUp={stopResizing}
          onPointerCancel={stopResizing}
          onLostPointerCapture={stopResizing}
          onDoubleClick={handleSeparatorDoubleClick("secondary")}
          onKeyDown={handleSeparatorKeyDown("secondary")}
        >
          <span className="pointer-events-none h-24 w-px rounded-full bg-slate-400/70 transition-colors group-hover:bg-sky-500 dark:bg-slate-500/70" />
        </div>
        <div style={{ width: rightWidth, minWidth: MIN_PANEL_WIDTH }} className="min-h-0 shrink-0">
          <WorkspacePanelShell>{nodyPanel}</WorkspacePanelShell>
        </div>
      </div>
    </div>
  );
}
