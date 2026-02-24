import { useEffect, useRef, useState } from "react";

type RecorderConfig = {
  enabled: boolean;
  showIndicator: boolean;
  host: string;
  username: string;
  password: string;
  stateName: string;
};

type RecorderState = {
  status: "idle" | "connecting" | "listening" | "error";
  error?: string;
  recording: boolean | null;
  lastUpdate?: number;
};

const STORAGE_KEY = "studio_timepiece_tricaster_record_v1";
const DEFAULT_CONFIG: RecorderConfig = {
  enabled: false,
  showIndicator: true,
  host: "",
  username: "",
  password: "",
  stateName: "recording",
};

const readStoredConfig = (): RecorderConfig => {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<RecorderConfig>;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      showIndicator: parsed.showIndicator ?? DEFAULT_CONFIG.showIndicator,
      host: parsed.host ?? DEFAULT_CONFIG.host,
      username: parsed.username ?? DEFAULT_CONFIG.username,
      password: parsed.password ?? DEFAULT_CONFIG.password,
      stateName: parsed.stateName ?? DEFAULT_CONFIG.stateName,
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

const decodeSocketMessage = async (data: unknown): Promise<string | null> => {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new TextDecoder().decode(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  return null;
};

const parseRecordingValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (["1", "true", "yes", "on", "record", "recording", "active"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "stop", "stopped", "idle", "inactive"].includes(normalized)) return false;
  const numeric = Number(normalized);
  if (!Number.isNaN(numeric)) return numeric > 0;
  return null;
};

export const useTriCasterRecording = () => {
  const [config, setConfigState] = useState<RecorderConfig>(() => readStoredConfig());
  const [state, setState] = useState<RecorderState>({
    status: "idle",
    recording: null,
  });
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const host = config.host;
    const username = config.username;
    const password = config.password;
    const stateName = config.stateName.trim();

    if (reconnectRef.current) {
      window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }

    if (!config.enabled) {
      socketRef.current?.close();
      socketRef.current = null;
      setState({ status: "idle", error: undefined, recording: null });
      return;
    }

    const url = buildWsUrl(host, username, password);
    if (!url) {
      setState((prev) => ({ ...prev, status: "error", error: "Missing TriCaster host" }));
      return;
    }

    if (!stateName) {
      setState((prev) => ({ ...prev, status: "error", error: "Missing record state name" }));
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
        if (!active) return;
        void (async () => {
          const message = await decodeSocketMessage(event.data);
          if (!message) return;
          const updates = parseShortcutStates(message);
          if (updates.length === 0) return;
          for (const update of updates) {
            if (update.name !== stateName) continue;
            const recording = parseRecordingValue(update.value);
            if (recording == null) continue;
            setState((prev) => ({ ...prev, recording, lastUpdate: Date.now() }));
          }
        })();
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
  }, [config.enabled, config.host, config.username, config.password, config.stateName]);

  const setConfig = (next: Partial<RecorderConfig>) => {
    setConfigState((prev) => ({ ...prev, ...next }));
  };

  return {
    config,
    setConfig,
    state,
  };
};

export type { RecorderConfig, RecorderState };
