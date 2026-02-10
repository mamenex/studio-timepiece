import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type MicChannel = {
  channel: number;
  on: boolean;
  fader: number;
  live: boolean;
};

type MicStatePayload = {
  channels: MicChannel[];
  any_live: boolean;
  updated_at: number;
};

type X32Config = {
  enabled: boolean;
  showIndicator: boolean;
  host: string;
  port: number;
  threshold: number;
};

type X32State = {
  status: "idle" | "listening" | "error";
  error?: string;
  channels: MicChannel[];
  anyLive: boolean;
  lastUpdate?: number;
};

const STORAGE_KEY = "studio_timepiece_x32_v1";
const DEFAULT_CONFIG: X32Config = {
  enabled: false,
  showIndicator: true,
  host: "192.168.0.100",
  port: 10023,
  threshold: 0.0001,
};
const CHANNELS = [1, 2, 3, 4, 5, 6];

const isTauri = () => {
  if (typeof window === "undefined") return false;
  const globals = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(globals.__TAURI__ || globals.__TAURI_INTERNALS__);
};

const readStoredConfig = (): X32Config => {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<X32Config>;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      showIndicator: parsed.showIndicator ?? DEFAULT_CONFIG.showIndicator,
      host: parsed.host ?? DEFAULT_CONFIG.host,
      port: parsed.port ?? DEFAULT_CONFIG.port,
      threshold: parsed.threshold ?? DEFAULT_CONFIG.threshold,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
};

export const useX32MicLive = () => {
  const [config, setConfigState] = useState<X32Config>(() => readStoredConfig());
  const [state, setState] = useState<X32State>({
    status: "idle",
    channels: [],
    anyLive: false,
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!isTauri()) {
      setState((prev) => ({ ...prev, status: "idle", error: undefined }));
      return;
    }

    let unlisten: (() => void) | undefined;
    let active = true;

    const start = async () => {
      if (!config.enabled) {
        try {
          await invoke("stop_x32_listener");
        } catch {
          // ignore
        }
        setState((prev) => ({ ...prev, status: "idle", error: undefined }));
        return;
      }

      try {
        await invoke("start_x32_listener", {
          host: config.host,
          port: config.port,
          channels: CHANNELS,
          threshold: config.threshold,
        });
        if (!active) return;
        setState((prev) => ({ ...prev, status: "listening", error: undefined }));
        const unlistenFn = await listen<MicStatePayload>("x32_mic_state", (event) => {
          const payload = event.payload;
          setState({
            status: "listening",
            channels: payload.channels ?? [],
            anyLive: payload.any_live ?? false,
            lastUpdate: payload.updated_at,
          });
        });
        unlisten = () => {
          unlistenFn();
        };
      } catch (err) {
        if (!active) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Failed to start X32 listener",
        }));
      }
    };

    start();

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [config]);

  const liveChannels = useMemo(
    () => state.channels.filter((channel) => channel.live).map((channel) => channel.channel),
    [state.channels],
  );

  const setConfig = (next: Partial<X32Config>) => {
    setConfigState((prev) => ({ ...prev, ...next }));
  };

  return {
    config,
    setConfig,
    state,
    liveChannels,
    channels: CHANNELS,
    isTauri: isTauri(),
  };
};
