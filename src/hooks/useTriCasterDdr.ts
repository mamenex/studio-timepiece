import { useEffect, useMemo, useRef, useState } from "react";

type TriCasterConfig = {
  enabled: boolean;
  showCountdown: boolean;
  host: string;
  username: string;
  password: string;
  label: string;
  remainingStatePattern: string;
};

type TriCasterState = {
  status: "idle" | "connecting" | "listening" | "error";
  error?: string;
  programTally: string[];
  remainingByDdr: Record<number, { seconds: number; updatedAt: number }>;
  lastUpdate?: number;
};

type DdrCountdownState = {
  active: boolean;
  activeDdr: number | null;
  remainingSeconds: number | null;
};

const STORAGE_KEY = "studio_timepiece_tricaster_ddr_v1";
const DEFAULT_CONFIG: TriCasterConfig = {
  enabled: false,
  showCountdown: true,
  host: "192.168.0.100:5951",
  username: "",
  password: "",
  label: "Inslag",
  remainingStatePattern: "ddr{n}_time_remaining",
};

const isValidNumber = (value: number) => Number.isFinite(value) && !Number.isNaN(value);

const readStoredConfig = (): TriCasterConfig => {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<TriCasterConfig>;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      showCountdown: parsed.showCountdown ?? DEFAULT_CONFIG.showCountdown,
      host: parsed.host ?? DEFAULT_CONFIG.host,
      username: parsed.username ?? DEFAULT_CONFIG.username,
      password: parsed.password ?? DEFAULT_CONFIG.password,
      label: parsed.label ?? DEFAULT_CONFIG.label,
      remainingStatePattern: parsed.remainingStatePattern ?? DEFAULT_CONFIG.remainingStatePattern,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
};

const buildWsUrl = (host: string, username: string, password: string) => {
  const trimmed = host.trim();
  if (!trimmed) return null;

  let protocol = "ws://";
  let target = trimmed;

  if (trimmed.startsWith("ws://")) {
    protocol = "ws://";
    target = trimmed.slice(5);
  } else if (trimmed.startsWith("wss://")) {
    protocol = "wss://";
    target = trimmed.slice(6);
  } else if (trimmed.startsWith("http://")) {
    protocol = "ws://";
    target = trimmed.slice(7);
  } else if (trimmed.startsWith("https://")) {
    protocol = "wss://";
    target = trimmed.slice(8);
  }

  const auth = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ""}@`
    : "";
  const normalizedTarget = target.replace(/\/+$/, "");
  return `${protocol}${auth}${normalizedTarget}/v1/shortcut_state_notifications`;
};

const parseShortcutStates = (message: string) => {
  const matches = message.match(/<shortcut_state[^>]*>/g);
  if (!matches) return [] as Array<{ name: string; value: string }>;
  return matches
    .map((tag) => {
      const attrs: Record<string, string> = {};
      tag.replace(/(\w+)="([^"]*)"/g, (_, key, value) => {
        attrs[key] = value;
        return "";
      });
      if (!attrs.name) return null;
      return { name: attrs.name, value: attrs.value ?? "" };
    })
    .filter((entry): entry is { name: string; value: string } => Boolean(entry));
};

const parseProgramTally = (value: string) =>
  value
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseDurationToSeconds = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return isValidNumber(numeric) ? numeric : null;
  }
  const cleaned = trimmed.split(".")[0];
  const parts = cleaned.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return null;
};

const getActiveDdrFromTally = (tally: string[]) => {
  for (const entry of tally) {
    const match = entry.match(/DDR\s*(\d+)/i);
    if (match) return Number(match[1]);
  }
  return null;
};

const buildRemainingRegex = (pattern: string) => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withGroup = escaped.replace(/\\\{n\\\}/g, "(\\d+)");
  try {
    return new RegExp(`^${withGroup}$`, "i");
  } catch {
    return null;
  }
};

export const useTriCasterDdr = () => {
  const [config, setConfigState] = useState<TriCasterConfig>(() => readStoredConfig());
  const [state, setState] = useState<TriCasterState>({
    status: "idle",
    programTally: [],
    remainingByDdr: {},
  });
  const [tick, setTick] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((prev) => prev + 1), 500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (reconnectRef.current) {
      window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }

    if (!config.enabled) {
      socketRef.current?.close();
      socketRef.current = null;
      setState((prev) => ({ ...prev, status: "idle", error: undefined }));
      return;
    }

    const url = buildWsUrl(config.host, config.username, config.password);
    if (!url) {
      setState((prev) => ({ ...prev, status: "error", error: "Missing TriCaster host" }));
      return;
    }

    let active = true;

    const connect = () => {
      if (!active) return;
      setState((prev) => ({ ...prev, status: "connecting", error: undefined }));

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Failed to connect",
        }));
        return;
      }

      socketRef.current = socket;

      socket.onopen = () => {
        if (!active) return;
        setState((prev) => ({ ...prev, status: "listening", error: undefined }));
      };

      socket.onmessage = (event) => {
        if (!active || typeof event.data !== "string") return;
        const updates = parseShortcutStates(event.data);
        if (updates.length === 0) return;
        setState((prev) => {
          let nextProgramTally = prev.programTally;
          let nextRemaining = { ...prev.remainingByDdr };
          let changed = false;
          const remainingRegex = buildRemainingRegex(config.remainingStatePattern);

          for (const update of updates) {
            if (update.name === "program_tally") {
              nextProgramTally = parseProgramTally(update.value);
              changed = true;
            }

            if (remainingRegex) {
              const match = update.name.match(remainingRegex);
              if (match) {
                const ddrNumber = Number(match[1]);
                const seconds = parseDurationToSeconds(update.value);
                if (isValidNumber(ddrNumber) && seconds != null) {
                  nextRemaining = {
                    ...nextRemaining,
                    [ddrNumber]: { seconds, updatedAt: Date.now() },
                  };
                  changed = true;
                }
              }
            }
          }

          if (!changed) return prev;
          return {
            ...prev,
            programTally: nextProgramTally,
            remainingByDdr: nextRemaining,
            lastUpdate: Date.now(),
          };
        });
      };

      socket.onerror = () => {
        if (!active) return;
        setState((prev) => ({ ...prev, status: "error", error: "WebSocket error" }));
      };

      socket.onclose = () => {
        if (!active) return;
        setState((prev) => ({ ...prev, status: "error", error: "Connection closed" }));
        reconnectRef.current = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      active = false;
      socketRef.current?.close();
      socketRef.current = null;
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
  }, [config.enabled, config.host, config.username, config.password, config.remainingStatePattern]);

  const activeDdr = useMemo(() => getActiveDdrFromTally(state.programTally), [state.programTally, tick]);
  const activeRemainingEntry = activeDdr != null ? state.remainingByDdr[activeDdr] : null;
  const remainingSeconds = activeRemainingEntry
    ? Math.max(0, activeRemainingEntry.seconds - (Date.now() - activeRemainingEntry.updatedAt) / 1000)
    : null;

  const countdown: DdrCountdownState = {
    active: Boolean(activeDdr != null && remainingSeconds != null && remainingSeconds > 0),
    activeDdr,
    remainingSeconds: remainingSeconds != null ? Math.floor(remainingSeconds) : null,
  };

  const setConfig = (next: Partial<TriCasterConfig>) => {
    setConfigState((prev) => ({ ...prev, ...next }));
  };

  return {
    config,
    setConfig,
    state,
    countdown,
  };
};

export type { TriCasterConfig, TriCasterState, DdrCountdownState };
