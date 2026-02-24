import { useEffect, useMemo, useRef, useState } from "react";

type TriCasterConfig = {
  enabled: boolean;
  showCountdown: boolean;
  host: string;
  username: string;
  password: string;
  label: string;
  remainingStatePattern: string;
  playStatePattern: string;
  useEstimatedCountdown: boolean;
  estimatedDurationSeconds: number;
};

type TriCasterState = {
  status: "idle" | "connecting" | "listening" | "error";
  error?: string;
  programTally: string[];
  remainingByDdr: Record<number, { seconds: number; updatedAt: number; delta: number }>;
  playingByDdr: Record<number, { playing: boolean; updatedAt: number; startedAt: number | null }>;
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
  playStatePattern: "ddr{n}_play",
  useEstimatedCountdown: true,
  estimatedDurationSeconds: 30,
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
      playStatePattern: parsed.playStatePattern ?? DEFAULT_CONFIG.playStatePattern,
      useEstimatedCountdown: parsed.useEstimatedCountdown ?? DEFAULT_CONFIG.useEstimatedCountdown,
      estimatedDurationSeconds: isValidNumber(Number(parsed.estimatedDurationSeconds))
        ? Math.max(1, Number(parsed.estimatedDurationSeconds))
        : DEFAULT_CONFIG.estimatedDurationSeconds,
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

const buildHttpDictionaryUrl = (host: string, key: string) => {
  const trimmed = host.trim();
  if (!trimmed) return null;

  let protocol = "http://";
  let target = trimmed;

  if (trimmed.startsWith("ws://")) {
    protocol = "http://";
    target = trimmed.slice(5);
  } else if (trimmed.startsWith("wss://")) {
    protocol = "https://";
    target = trimmed.slice(6);
  } else if (trimmed.startsWith("http://")) {
    protocol = "http://";
    target = trimmed.slice(7);
  } else if (trimmed.startsWith("https://")) {
    protocol = "https://";
    target = trimmed.slice(8);
  }

  const normalizedTarget = target.replace(/\/+$/, "");
  return `${protocol}${normalizedTarget}/v1/dictionary?key=${encodeURIComponent(key)}`;
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

const parseProgramTally = (value: string) =>
  value
    .split(/[|,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseDurationToSeconds = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return isValidNumber(numeric) ? numeric : null;
  }
  const cleaned = trimmed.split(".")[0].replace(";", ":");
  const parts = cleaned.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 4) {
    // TriCaster commonly reports HH:MM:SS:FF (frames); include fractional seconds.
    const [h, m, s, framesOrMillis] = parts;
    const fractional = framesOrMillis >= 0 && framesOrMillis < 100 ? framesOrMillis / 30 : framesOrMillis / 1000;
    return h * 3600 + m * 60 + s + fractional;
  }
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

const parseBooleanValue = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "play", "playing", "active"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "stop", "stopped", "idle", "inactive"].includes(normalized)) return false;
  return null;
};

const parseStopValueAsPlaying = (value: string) => {
  const stop = parseBooleanValue(value);
  return stop == null ? null : !stop;
};

const getActiveDdrFromTally = (tally: string[]) => {
  for (const entry of tally) {
    const match = entry.match(/DDR[\s_-]*(\d+)/i);
    if (match) return Number(match[1]);
  }
  return null;
};

const getActiveDdrFromPlaying = (
  playingByDdr: Record<number, { playing: boolean; updatedAt: number; startedAt: number | null }>,
) => {
  const activeEntries = Object.entries(playingByDdr)
    .map(([key, value]) => ({ ddr: Number(key), ...value }))
    .filter((entry) => isValidNumber(entry.ddr) && entry.playing);
  if (activeEntries.length === 0) return null;
  activeEntries.sort((a, b) => b.updatedAt - a.updatedAt);
  return activeEntries[0].ddr;
};

const getActiveDdrFromRemaining = (
  remainingByDdr: Record<number, { seconds: number; updatedAt: number; delta: number }>,
) => {
  const entries = Object.entries(remainingByDdr)
    .map(([key, value]) => ({ ddr: Number(key), ...value }))
    .filter((entry) => isValidNumber(entry.ddr));
  if (entries.length === 0) return null;
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries[0].ddr;
};

const getActiveDdrFromDecreasingRemaining = (
  remainingByDdr: Record<number, { seconds: number; updatedAt: number; delta: number }>,
) => {
  const now = Date.now();
  const entries = Object.entries(remainingByDdr)
    .map(([key, value]) => ({ ddr: Number(key), ...value }))
    .filter(
      (entry) =>
        isValidNumber(entry.ddr) &&
        now - entry.updatedAt < 3000 &&
        entry.delta < -0.001,
    );
  if (entries.length === 0) return null;
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries[0].ddr;
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

const extractDdrFromRemainingStateName = (name: string) => {
  const normalized = name.trim();
  const match = normalized.match(/ddr[\s_-]*(\d+).*?(?:time[\s_-]*remaining|remaining)/i);
  if (!match) return null;
  const ddrNumber = Number(match[1]);
  return isValidNumber(ddrNumber) ? ddrNumber : null;
};

const extractDdrFromPlaybackStateName = (name: string) => {
  const normalized = name.trim();
  const match = normalized.match(/ddr[\s_-]*(\d+).*?(?:play|stop|pause)/i);
  if (!match) return null;
  const ddrNumber = Number(match[1]);
  return isValidNumber(ddrNumber) ? ddrNumber : null;
};

const parseXmlAttributes = (raw: string) => {
  const attrs: Record<string, string> = {};
  raw.replace(/(\w+)="([^"]*)"/g, (_, key, value) => {
    attrs[key] = value;
    return "";
  });
  return attrs;
};

const parseDdrNumberCandidate = (value: string | undefined) => {
  if (!value) return null;
  const match = value.match(/ddr[\s_-]*(\d+)/i);
  if (match) return Number(match[1]);
  if (/^\d+$/.test(value)) return Number(value);
  return null;
};

const detectDdrNumberFromTag = (tagName: string, attrs: Record<string, string>) => {
  const fromTag = parseDdrNumberCandidate(tagName);
  if (fromTag != null && isValidNumber(fromTag)) return fromTag;
  const candidates = [attrs.ddr, attrs.index, attrs.id, attrs.name, attrs.player, attrs.channel];
  for (const candidate of candidates) {
    const parsed = parseDdrNumberCandidate(candidate);
    if (parsed != null && isValidNumber(parsed)) return parsed;
  }
  return null;
};

const findDurationAttribute = (
  attrs: Record<string, string>,
  names: string[],
) => {
  for (const name of names) {
    if (attrs[name] != null) {
      const seconds = parseDurationToSeconds(attrs[name]);
      if (seconds != null) return seconds;
    }
  }
  return null;
};

const parseDdrTimecodeRemaining = (xml: string) => {
  const tagMatches = xml.match(/<([a-zA-Z0-9_:-]+)([^>]*)>/g);
  if (!tagMatches) return {} as Record<number, number>;
  const remainingByDdr: Record<number, number> = {};

  for (const tag of tagMatches) {
    if (tag.startsWith("</")) continue;
    const tagMatch = tag.match(/^<([a-zA-Z0-9_:-]+)([^>]*)>$/);
    if (!tagMatch) continue;
    const [, tagName, rawAttrs] = tagMatch;
    const attrs = parseXmlAttributes(rawAttrs);
    const ddrNumber = detectDdrNumberFromTag(tagName, attrs);
    if (ddrNumber == null) continue;

    const directRemaining = findDurationAttribute(attrs, [
      "clip_seconds_remaining",
      "playlist_seconds_remaining",
      "remaining",
      "time_remaining",
      "remaining_time",
      "timeleft",
      "time_left",
      "left",
    ]);
    if (directRemaining != null) {
      remainingByDdr[ddrNumber] = directRemaining;
      continue;
    }

    const duration = findDurationAttribute(attrs, [
      "file_duration",
      "clip_duration",
      "playlist_duration",
      "duration",
      "total",
      "total_time",
      "length",
    ]);
    const elapsed = findDurationAttribute(attrs, [
      "clip_seconds_elapsed",
      "playlist_seconds_elapsed",
      "elapsed",
      "position",
      "pos",
      "current",
      "timecode",
      "clip_embedded_timecode",
    ]);
    if (duration != null && elapsed != null) {
      remainingByDdr[ddrNumber] = Math.max(0, duration - elapsed);
    }
  }

  return remainingByDdr;
};

const applyShortcutUpdates = (
  prev: TriCasterState,
  updates: Array<{ name: string; value: string }>,
  config: TriCasterConfig,
): TriCasterState => {
  let nextProgramTally = prev.programTally;
  let nextRemaining = { ...prev.remainingByDdr };
  let nextPlaying = { ...prev.playingByDdr };
  let changed = false;
  const remainingRegex = buildRemainingRegex(config.remainingStatePattern);
  const playRegex = buildRemainingRegex(config.playStatePattern);

  for (const update of updates) {
    if (update.name === "program_tally" || /program_tally/i.test(update.name)) {
      const parsedTally = parseProgramTally(update.value);
      if (parsedTally.join("|") !== nextProgramTally.join("|")) {
        nextProgramTally = parsedTally;
        changed = true;
      }
    }

    let ddrNumber: number | null = null;
    if (remainingRegex) {
      const match = update.name.match(remainingRegex);
      if (match) ddrNumber = Number(match[1]);
    }
    if (ddrNumber == null) {
      ddrNumber = extractDdrFromRemainingStateName(update.name);
    }

    if (ddrNumber != null) {
      const seconds = parseDurationToSeconds(update.value);
      if (seconds != null) {
        const prevRemaining = nextRemaining[ddrNumber];
        if (!prevRemaining || Math.abs(prevRemaining.seconds - seconds) > 0.01) {
          const delta = prevRemaining ? seconds - prevRemaining.seconds : 0;
          nextRemaining = {
            ...nextRemaining,
            [ddrNumber]: { seconds, updatedAt: Date.now(), delta },
          };
          changed = true;
        }
      }
    }

    let playDdrNumber: number | null = null;
    if (playRegex) {
      const match = update.name.match(playRegex);
      if (match) playDdrNumber = Number(match[1]);
    }
    if (playDdrNumber == null) {
      playDdrNumber = extractDdrFromPlaybackStateName(update.name);
    }
    if (playDdrNumber == null && /^(?:ddr|focusedddr)_(?:play|stop|pause)$/i.test(update.name)) {
      playDdrNumber = getActiveDdrFromTally(nextProgramTally) ?? getActiveDdrFromTally(prev.programTally);
    }

    if (playDdrNumber != null) {
      const isStop = /stop$/i.test(update.name);
      const isPause = /pause$/i.test(update.name);
      const parsed = parseBooleanValue(update.value);
      const playing = isStop
        ? parseStopValueAsPlaying(update.value)
        : isPause
          ? parsed === true
            ? false
            : null
          : parsed;
      if (playing != null) {
        const now = Date.now();
        const prevEntry = nextPlaying[playDdrNumber] ?? prev.playingByDdr[playDdrNumber];
        if (!prevEntry || prevEntry.playing !== playing) {
          const startedAt = playing ? (prevEntry?.playing ? prevEntry.startedAt ?? now : now) : null;
          nextPlaying = {
            ...nextPlaying,
            [playDdrNumber]: { playing, updatedAt: now, startedAt },
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
    playingByDdr: nextPlaying,
    lastUpdate: Date.now(),
  };
};

export const useTriCasterDdr = () => {
  const [config, setConfigState] = useState<TriCasterConfig>(() => readStoredConfig());
  const [state, setState] = useState<TriCasterState>({
    status: "idle",
    programTally: [],
    remainingByDdr: {},
    playingByDdr: {},
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
        if (!active) return;
        void (async () => {
          const message = await decodeSocketMessage(event.data);
          if (!message) return;
          const updates = parseShortcutStates(message);
          if (updates.length === 0) return;
          setState((prev) => applyShortcutUpdates(prev, updates, config));
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
  }, [
    config.enabled,
    config.host,
    config.username,
    config.password,
    config.remainingStatePattern,
    config.playStatePattern,
  ]);

  useEffect(() => {
    if (!config.enabled) return;
    const shortcutStatesUrl = buildHttpDictionaryUrl(config.host, "shortcut_states");
    const ddrTimecodeUrl = buildHttpDictionaryUrl(config.host, "ddr_timecode");
    if (!shortcutStatesUrl && !ddrTimecodeUrl) return;

    let cancelled = false;
    const headers: Record<string, string> = {};
    if (config.username) {
      headers.Authorization = `Basic ${window.btoa(`${config.username}:${config.password}`)}`;
    }

    const pollShortcutStates = async () => {
      if (!shortcutStatesUrl) return;
      try {
        const response = await fetch(shortcutStatesUrl, {
          cache: "no-store",
          headers,
        });
        if (!response.ok) return;
        const xml = await response.text();
        if (cancelled) return;
        const updates = parseShortcutStates(xml);
        if (updates.length === 0) return;
        setState((prev) => applyShortcutUpdates(prev, updates, config));
      } catch {
        // Ignore polling failures; websocket may still be active.
      }
    };

    const pollDdrTimecode = async () => {
      if (!ddrTimecodeUrl) return;
      try {
        const response = await fetch(ddrTimecodeUrl, {
          cache: "no-store",
          headers,
        });
        if (!response.ok) return;
        const xml = await response.text();
        if (cancelled) return;
        const remainingByDdr = parseDdrTimecodeRemaining(xml);
        const entries = Object.entries(remainingByDdr);
        if (entries.length === 0) return;
        const now = Date.now();
        setState((prev) => {
          let changed = false;
          let nextRemaining = prev.remainingByDdr;
          for (const [ddrKey, seconds] of entries) {
            const ddr = Number(ddrKey);
            const prevEntry = prev.remainingByDdr[ddr];
            if (!prevEntry || Math.abs(prevEntry.seconds - seconds) > 0.01) {
              if (nextRemaining === prev.remainingByDdr) {
                nextRemaining = { ...prev.remainingByDdr };
              }
              nextRemaining[ddr] = { seconds, updatedAt: now, delta: prevEntry ? seconds - prevEntry.seconds : 0 };
              changed = true;
            }
          }
          if (!changed) return prev;
          return {
            ...prev,
            remainingByDdr: nextRemaining,
            lastUpdate: now,
          };
        });
      } catch {
        // Ignore polling failures.
      }
    };

    void pollShortcutStates();
    void pollDdrTimecode();
    const id = window.setInterval(() => {
      void pollShortcutStates();
      void pollDdrTimecode();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [config.enabled, config.host, config.username, config.password, config.remainingStatePattern, config.playStatePattern]);

  const activeDdr = useMemo(
    () =>
      getActiveDdrFromDecreasingRemaining(state.remainingByDdr) ??
      getActiveDdrFromTally(state.programTally) ??
      getActiveDdrFromPlaying(state.playingByDdr) ??
      getActiveDdrFromRemaining(state.remainingByDdr),
    [state.programTally, state.playingByDdr, state.remainingByDdr, tick],
  );
  const activePlayingEntry = activeDdr != null ? state.playingByDdr[activeDdr] : null;
  const now = Date.now();
  const activeRemainingEntry = activeDdr != null ? state.remainingByDdr[activeDdr] : null;
  const hasRecentDirectDecrease =
    activeRemainingEntry != null &&
    now - activeRemainingEntry.updatedAt < 3000 &&
    activeRemainingEntry.delta < -0.001;
  const directRemainingSeconds = activeRemainingEntry
    ? Math.max(
        0,
        activeRemainingEntry.seconds -
          (hasRecentDirectDecrease ? (now - activeRemainingEntry.updatedAt) / 1000 : 0),
      )
    : null;
  const remainingSeconds = hasRecentDirectDecrease ? directRemainingSeconds : null;
  const isCountdownVisible = hasRecentDirectDecrease;

  const countdown: DdrCountdownState = {
    active: Boolean(isCountdownVisible && activeDdr != null && remainingSeconds != null && remainingSeconds > 0),
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
