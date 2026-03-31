import type { FC } from "react";
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

export const MessageMetadata: FC<MessageMetadataProps> = ({
  messageId,
  parentIdDisplay,
  branchIdValue,
  latencyInfo,
  role,
  modelInfo,
}) => {
  return (
    <div className="text-xs text-muted-foreground mb-1">
      <div>
        <b>id:</b> {messageId ?? "-"}
      </div>
      <div>
        <b>parentId:</b> {parentIdDisplay ?? "-"}
      </div>
      <div>
        <b>branchId:</b> {branchIdValue ?? "-"}
      </div>
      <div>
        <b>type:</b> {role ?? "-"}
      </div>
      <div>
        <b>Model:</b> {modelInfo.provider ?? "-"} · {modelInfo.model ?? "-"}
      </div>
      {latencyInfo ? (
        <div>
          <b>Latency:</b> start {formatLatencyMs(latencyInfo.responseStartMs)} · total{" "}
          {formatLatencyMs(latencyInfo.totalMs)}
        </div>
      ) : null}
    </div>
  );
};
