import React, { type FC } from "react";
import type { ResolvedLatencyInfo, ResolvedModelInfo } from "./message-utils";

type MessageMetadataProps = {
  messageId?: string;
  parentIdDisplay: string | null;
  branchIdValue: string | null;
  role?: string;
  latencyInfo: ResolvedLatencyInfo | null;
  modelInfo: ResolvedModelInfo;
};

const formatLatencyMs = (value: number | null) => {
  if (value == null) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} s`;
};

const DEBUG_METADATA_STORAGE_KEY = "nodes.debug.message-metadata";

const readDebugMetadataFlag = () => {
  if (typeof window === "undefined") return false;

  const searchParams = new URLSearchParams(window.location.search);
  if (
    searchParams.get("debugMessages") === "1" ||
    searchParams.get("debug") === "messages"
  ) {
    return true;
  }

  try {
    return window.localStorage.getItem(DEBUG_METADATA_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const MessageMetadata: FC<MessageMetadataProps> = ({
  messageId,
  parentIdDisplay,
  branchIdValue,
  latencyInfo,
  role,
  modelInfo,
}) => {
  const [showDebugMetadata, setShowDebugMetadata] = React.useState(false);

  React.useEffect(() => {
    setShowDebugMetadata(readDebugMetadataFlag());
  }, []);

  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {role ? (
        <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5 uppercase tracking-[0.14em]">
          {role}
        </span>
      ) : null}
      <span>
        <b>Model:</b> {modelInfo.provider ?? "-"} · {modelInfo.model ?? "-"}
      </span>
      {latencyInfo ? (
        <span>
          <b>Latency:</b> start {formatLatencyMs(latencyInfo.responseStartMs)} · total{" "}
          {formatLatencyMs(latencyInfo.totalMs)}
        </span>
      ) : null}
      {showDebugMetadata ? (
        <>
          <span>
            <b>id:</b> {messageId ?? "-"}
          </span>
          <span>
            <b>parentId:</b> {parentIdDisplay ?? "-"}
          </span>
          <span>
            <b>branchId:</b> {branchIdValue ?? "-"}
          </span>
        </>
      ) : null}
    </div>
  );
};
