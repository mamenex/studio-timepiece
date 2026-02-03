import { useEffect, useState } from "react";

export type ClockSource = "local" | "world";

type ClockState = {
  source: ClockSource;
  now: Date;
  statusLabel: string;
  lastSync: Date | null;
  setSource: (next: ClockSource) => void;
};

const STORAGE_KEY = "studio_timepiece_clock_source_v1";
const RESYNC_MS = 5 * 60 * 1000;

const readStoredSource = (): ClockSource => {
  if (typeof window === "undefined") return "local";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "world" || stored === "local") return stored;
  return "local";
};

export const useClock = (): ClockState => {
  const [source, setSourceState] = useState<ClockSource>(() => readStoredSource());
  const [offsetMs, setOffsetMs] = useState(0);
  const [statusLabel, setStatusLabel] = useState("Offline computer clock");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, source);
  }, [source]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      if (event.newValue === "world" || event.newValue === "local") {
        setSourceState(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    let interval: number | undefined;
    let tickTimer: number | undefined;
    let active = true;

    const syncWorldTime = async () => {
      try {
        const response = await fetch("https://worldtimeapi.org/api/ip", { cache: "no-store" });
        if (!response.ok) throw new Error(`WorldTimeAPI ${response.status}`);
        const data = (await response.json()) as { unixtime?: number };
        if (!data.unixtime) throw new Error("Missing unixtime");
        const serverMs = data.unixtime * 1000;
        const localMs = Date.now();
        if (!active) return;
        setOffsetMs(serverMs - localMs);
        setLastSync(new Date());
        setStatusLabel("World clock");
      } catch {
        if (!active) return;
        setOffsetMs(0);
        setStatusLabel("Offline computer clock");
      }
    };

    if (source === "world") {
      syncWorldTime();
      interval = window.setInterval(syncWorldTime, RESYNC_MS);
    } else {
      setOffsetMs(0);
      setStatusLabel("Offline computer clock");
      setLastSync(null);
    }

    tickTimer = window.setInterval(() => {
      if (!active) return;
      setNow(new Date(Date.now() + offsetMs));
    }, 100);

    return () => {
      active = false;
      if (interval) window.clearInterval(interval);
      if (tickTimer) window.clearInterval(tickTimer);
    };
  }, [source, offsetMs]);

  const setSource = (next: ClockSource) => {
    setSourceState(next);
  };

  return { source, now, statusLabel, lastSync, setSource };
};
