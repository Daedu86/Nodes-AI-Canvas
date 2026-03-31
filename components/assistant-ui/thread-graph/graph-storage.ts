import type { LinkConnectorPref, NodePosition } from "./graph-types";
import { CONN_KEY, POS_KEY } from "./graph-types";
import { isConnectorId } from "./graph-geometry";

export type FlowViewportState = {
  x: number;
  y: number;
  zoom: number;
};

const FLOW_VIEW_KEY = "a-ui.graph-flow-view.v1";

const scopedKey = (baseKey: string, sessionId?: string | null) =>
  sessionId ? `${baseKey}:${sessionId}` : baseKey;

const readStorageValue = (baseKey: string, sessionId?: string | null) => {
  try {
    const sessionValue = localStorage.getItem(scopedKey(baseKey, sessionId));
    if (sessionValue !== null) return sessionValue;
    return localStorage.getItem(baseKey);
  } catch {
    return null;
  }
};

export const readConnectorPrefs = (sessionId?: string | null): Map<string, LinkConnectorPref> => {
  try {
    const raw = readStorageValue(CONN_KEY, sessionId);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, { from?: string; to?: string }>;
    const map = new Map<string, LinkConnectorPref>();
    for (const [key, value] of Object.entries(parsed)) {
      const from = value?.from;
      const to = value?.to;
      if (isConnectorId(from) && isConnectorId(to)) {
        map.set(key, { from, to });
      }
    }
    return map;
  } catch {
    return new Map();
  }
};

export const writeConnectorPrefs = (
  linkConnectors: Map<string, LinkConnectorPref>,
  sessionId?: string | null,
) => {
  try {
    const storageKey = scopedKey(CONN_KEY, sessionId);
    if (linkConnectors.size === 0) {
      localStorage.removeItem(storageKey);
      return;
    }
    const output: Record<string, LinkConnectorPref> = {};
    linkConnectors.forEach((value, key) => {
      output[key] = value;
    });
    localStorage.setItem(storageKey, JSON.stringify(output));
  } catch {
    // ignore storage errors
  }
};

export const readNodePositions = (sessionId?: string | null): Map<string, NodePosition> => {
  try {
    const raw = readStorageValue(POS_KEY, sessionId);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, [number, number]>;
    const map = new Map<string, NodePosition>();
    for (const [id, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number") {
        map.set(id, { x: value[0], y: value[1] });
      }
    }
    return map;
  } catch {
    return new Map();
  }
};

export const writeNodePositions = (
  nodePositions: Map<string, NodePosition>,
  sessionId?: string | null,
) => {
  try {
    const storageKey = scopedKey(POS_KEY, sessionId);
    if (nodePositions.size === 0) {
      localStorage.removeItem(storageKey);
      return;
    }
    const output: Record<string, [number, number]> = {};
    nodePositions.forEach((value, key) => {
      output[key] = [value.x, value.y];
    });
    localStorage.setItem(storageKey, JSON.stringify(output));
  } catch {
    // ignore storage errors
  }
};

export const readFlowViewport = (sessionId?: string | null): FlowViewportState | null => {
  try {
    const raw = readStorageValue(FLOW_VIEW_KEY, sessionId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FlowViewportState>;
    if (
      typeof parsed?.x === "number" &&
      typeof parsed?.y === "number" &&
      typeof parsed?.zoom === "number"
    ) {
      return {
        x: parsed.x,
        y: parsed.y,
        zoom: parsed.zoom,
      };
    }
    return null;
  } catch {
    return null;
  }
};

export const writeFlowViewport = (
  viewport: FlowViewportState | null,
  sessionId?: string | null,
) => {
  try {
    const storageKey = scopedKey(FLOW_VIEW_KEY, sessionId);
    if (!viewport) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(viewport));
  } catch {
    // ignore storage errors
  }
};
