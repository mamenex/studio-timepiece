import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type CasparCgConfig = {
  enabled: boolean;
  host: string;
  port: number;
  channel: number;
  layer: number;
  template: string;
  data: string;
  templateRootPath: string;
};

type CasparCgState = {
  status: "idle" | "ready" | "error";
  error?: string;
  lastResponse?: string;
};

const STORAGE_KEY = "studio_timepiece_casparcg_v1";
const DEFAULT_CONFIG: CasparCgConfig = {
  enabled: false,
  host: "127.0.0.1",
  port: 5250,
  channel: 1,
  layer: 20,
  template: "",
  data: "{}",
  templateRootPath: "",
};

const isTauri = () => {
  if (typeof window === "undefined") return false;
  const globals = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(globals.__TAURI__ || globals.__TAURI_INTERNALS__);
};

const readStoredConfig = (): CasparCgConfig => {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<CasparCgConfig>;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      host: parsed.host ?? DEFAULT_CONFIG.host,
      port: parsed.port ?? DEFAULT_CONFIG.port,
      channel: parsed.channel ?? DEFAULT_CONFIG.channel,
      layer: parsed.layer ?? DEFAULT_CONFIG.layer,
      template: parsed.template ?? DEFAULT_CONFIG.template,
      data: parsed.data ?? DEFAULT_CONFIG.data,
      templateRootPath: parsed.templateRootPath ?? DEFAULT_CONFIG.templateRootPath,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
};

export const useCasparCg = () => {
  const [config, setConfigState] = useState<CasparCgConfig>(() => readStoredConfig());
  const [state, setState] = useState<CasparCgState>({ status: "idle" });
  const tauri = isTauri();

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const setConfig = (next: Partial<CasparCgConfig>) => {
    setConfigState((prev) => ({ ...prev, ...next }));
  };

  const run = async <T extends string>(command: T, payload: Record<string, unknown>) => {
    if (!tauri) {
      setState({ status: "error", error: "CasparCG control is only available in the Tauri app" });
      return null;
    }
    try {
      const response = await invoke<string>(command, payload);
      setState({ status: "ready", lastResponse: response });
      return response;
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to communicate with CasparCG",
      });
      return null;
    }
  };

  const ping = () =>
    run("casparcg_ping", {
      host: config.host,
      port: config.port,
    });

  const playTemplate = () =>
    run("casparcg_play_template", {
      host: config.host,
      port: config.port,
      channel: config.channel,
      layer: config.layer,
      template: config.template,
      data: config.data,
    });

  const playTemplateWith = (template: string, data: string) =>
    run("casparcg_play_template", {
      host: config.host,
      port: config.port,
      channel: config.channel,
      layer: config.layer,
      template,
      data,
    });

  const updateTemplate = () =>
    run("casparcg_update_template", {
      host: config.host,
      port: config.port,
      channel: config.channel,
      layer: config.layer,
      data: config.data,
    });

  const updateTemplateWith = (data: string) =>
    run("casparcg_update_template", {
      host: config.host,
      port: config.port,
      channel: config.channel,
      layer: config.layer,
      data,
    });

  const stopTemplate = () =>
    run("casparcg_stop_template", {
      host: config.host,
      port: config.port,
      channel: config.channel,
      layer: config.layer,
    });

  const uploadTemplateFile = (relativePath: string, content: string) =>
    run("casparcg_write_template_file", {
      templateRoot: config.templateRootPath,
      relativePath,
      content,
    });

  return {
    config,
    setConfig,
    state,
    ping,
    playTemplate,
    playTemplateWith,
    updateTemplate,
    updateTemplateWith,
    stopTemplate,
    uploadTemplateFile,
    isTauri: tauri,
  };
};
