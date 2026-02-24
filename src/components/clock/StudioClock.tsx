import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useWindowSize } from "@/hooks/useWindowSize";
import { useClock } from "@/hooks/useClock";
import { useX32MicLive } from "@/hooks/useX32MicLive";
import { useCasparCg } from "@/hooks/useCasparCg";
import { useTriCasterDdr } from "@/hooks/useTriCasterDdr";
import { useTriCasterRecording } from "@/hooks/useTriCasterRecording";
import { Maximize, Minimize, Timer, Calendar, Plus, Minus, Type, Circle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SecondsRing from "./SecondsRing";
import DigitalDisplay from "./DigitalDisplay";
import Stopwatch from "./Stopwatch";
import RunningOrderLayout from "./RunningOrderLayout";
import DdrCountdown from "./DdrCountdown";
import ErrorBoundary from "@/components/ErrorBoundary";
const LOGO_STORAGE_KEY = "studio_timepiece_logo_v1";
const LOGO_INVERT_KEY = "studio_timepiece_logo_invert_v1";
const LAYOUT_STORAGE_KEY = "studio_timepiece_layout_v4";
const WATCHFACE_STORAGE_KEY = "studio_timepiece_watchface_v1";
const RED_FACE_CLOCK_OFFSET_DEFAULT = 0;
const RED_FACE_DDR_OFFSET_DEFAULT = 42;
const RED_FACE_CENTER_CORRECTION_X = -42;
const RED_FACE_ADORNMENT_CORRECTION_X = 42;

const checkLogoIsDark = (dataUrl: string): Promise<boolean> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const width = (canvas.width = 64);
      const height = (canvas.height = 64);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(false);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height).data;
      let total = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 20) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        total += luminance;
        count += 1;
      }
      if (count === 0) {
        resolve(false);
        return;
      }
      const avg = total / count;
      resolve(avg < 140);
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });

const StudioClock = () => {
  const { now: time, source: clockSource, statusLabel, lastSync, setSource: setClockSource } = useClock();
  const { config: x32Config, setConfig: setX32Config, state: x32State, liveChannels, isTauri } = useX32MicLive();
  const {
    config: casparConfig,
    setConfig: setCasparConfig,
    state: casparState,
    ping: pingCaspar,
    playTemplate: playCasparTemplate,
    playTemplateWith: playCasparTemplateWith,
    updateTemplateWith: updateCasparTemplateWith,
    updateTemplate: updateCasparTemplate,
    stopTemplate: stopCasparTemplate,
    uploadTemplateFile: uploadCasparTemplateFile,
  } = useCasparCg();
  const {
    config: tricasterConfig,
    setConfig: setTricasterConfig,
    state: tricasterState,
    countdown: tricasterCountdown,
  } = useTriCasterDdr();
  const {
    config: tricasterRecordConfig,
    setConfig: setTricasterRecordConfig,
    state: tricasterRecordState,
  } = useTriCasterRecording();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStopwatch, setShowStopwatch] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [titleText, setTitleText] = useState("Studioklocka");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [showLogo, setShowLogo] = useState(true);
  const [invertLogo, setInvertLogo] = useState(false);
  const [logoIsDark, setLogoIsDark] = useState(false);
  const [showSecondsRing, setShowSecondsRing] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [layoutOffsetX, setLayoutOffsetX] = useState(0);
  const [ddrGap, setDdrGap] = useState(56);
  const [redFaceClockOffsetX, setRedFaceClockOffsetX] = useState(RED_FACE_CLOCK_OFFSET_DEFAULT);
  const [redFaceDdrOffsetX, setRedFaceDdrOffsetX] = useState(RED_FACE_DDR_OFFSET_DEFAULT);
  const [watchface, setWatchface] = useState<"classic" | "red-stack">("classic");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mode, setMode] = useState<"clock" | "running-order" | "settings">("clock");
  const [keepClockOnPopout, setKeepClockOnPopout] = useState(true);
  const { width } = useWindowSize();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "available" | "downloading" | "installing" | "up-to-date" | "error"
  >("idle");
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<any | null>(null);
  const [casparUploadPath, setCasparUploadPath] = useState("");

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMode("clock");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(LOGO_STORAGE_KEY);
      if (stored) {
        setLogoDataUrl(stored);
      }
      const storedInvert = window.localStorage.getItem(LOGO_INVERT_KEY);
      if (storedInvert != null) {
        setInvertLogo(storedInvert === "true");
      }
      const storedLayout = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (storedLayout) {
        const parsed = JSON.parse(storedLayout) as Partial<{
          zoom: number;
          offsetX: number;
          ddrGap: number;
          redFaceClockOffsetX: number;
          redFaceDdrOffsetX: number;
          redFaceOffsetX: number;
        }>;
        if (typeof parsed.zoom === "number" && Number.isFinite(parsed.zoom)) {
          setZoom(Math.min(2.5, Math.max(0.3, parsed.zoom)));
        }
        if (typeof parsed.offsetX === "number" && Number.isFinite(parsed.offsetX)) {
          setLayoutOffsetX(Math.min(600, Math.max(-600, parsed.offsetX)));
        }
        if (typeof parsed.ddrGap === "number" && Number.isFinite(parsed.ddrGap)) {
          setDdrGap(Math.min(320, Math.max(0, parsed.ddrGap)));
        }
        const hasClockOffset = typeof parsed.redFaceClockOffsetX === "number" && Number.isFinite(parsed.redFaceClockOffsetX);
        const hasLegacyOffset = typeof parsed.redFaceOffsetX === "number" && Number.isFinite(parsed.redFaceOffsetX);
        const hasDdrOffset = typeof parsed.redFaceDdrOffsetX === "number" && Number.isFinite(parsed.redFaceDdrOffsetX);
        const parsedClockOffset = hasClockOffset
          ? parsed.redFaceClockOffsetX
          : hasLegacyOffset
            ? parsed.redFaceOffsetX
            : RED_FACE_CLOCK_OFFSET_DEFAULT;
        const parsedDdrOffset = hasDdrOffset ? parsed.redFaceDdrOffsetX : RED_FACE_DDR_OFFSET_DEFAULT;
        const isPreviousDefaultPair =
          (parsedClockOffset === -40 && parsedDdrOffset === 18) ||
          (parsedClockOffset === -72 && parsedDdrOffset === 64) ||
          (parsedClockOffset === -34 && parsedDdrOffset === 80) ||
          (parsedClockOffset === 0 && parsedDdrOffset === 0);
        setRedFaceClockOffsetX(
          Math.min(160, Math.max(-160, isPreviousDefaultPair ? RED_FACE_CLOCK_OFFSET_DEFAULT : parsedClockOffset)),
        );
        setRedFaceDdrOffsetX(
          Math.min(160, Math.max(-160, isPreviousDefaultPair ? RED_FACE_DDR_OFFSET_DEFAULT : parsedDdrOffset)),
        );
      }
      const storedWatchface = window.localStorage.getItem(WATCHFACE_STORAGE_KEY);
      if (storedWatchface === "classic" || storedWatchface === "red-stack") {
        setWatchface(storedWatchface);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (logoDataUrl) {
        window.localStorage.setItem(LOGO_STORAGE_KEY, logoDataUrl);
      } else {
        window.localStorage.removeItem(LOGO_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [logoDataUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOGO_INVERT_KEY, String(invertLogo));
    } catch {
      // ignore storage errors
    }
  }, [invertLogo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({
          zoom,
          offsetX: layoutOffsetX,
          ddrGap,
          redFaceClockOffsetX,
          redFaceDdrOffsetX,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [ddrGap, layoutOffsetX, redFaceClockOffsetX, redFaceDdrOffsetX, zoom]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(WATCHFACE_STORAGE_KEY, watchface);
    } catch {
      // ignore storage errors
    }
  }, [watchface]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!logoDataUrl) {
        setLogoIsDark(false);
        return;
      }
      const isDark = await checkLogoIsDark(logoDataUrl);
      if (!cancelled) {
        setLogoIsDark(isDark);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [logoDataUrl]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    const loadVersion = async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        if (!cancelled) {
          setAppVersion(version);
        }
      } catch {
        if (!cancelled) {
          setAppVersion(null);
        }
      }
    };
    loadVersion();
    return () => {
      cancelled = true;
    };
  }, [isTauri]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.1, 2.5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.1, 0.3));
  };

  const handleCheckUpdates = async () => {
    if (!isTauri) return;
    setUpdateStatus("checking");
    setUpdateMessage(null);
    setAvailableUpdate(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setAvailableUpdate(update);
        setUpdateStatus("available");
        setUpdateMessage(update.version ? `Update available: v${update.version}` : "Update available");
      } else {
        setUpdateStatus("up-to-date");
        setUpdateMessage("You are up to date.");
      }
    } catch (err) {
      setUpdateStatus("error");
      setUpdateMessage(err instanceof Error ? err.message : "Failed to check for updates.");
    }
  };

  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;
    setUpdateStatus("downloading");
    setUpdateMessage("Downloading update...");
    try {
      await availableUpdate.downloadAndInstall();
      setUpdateStatus("installing");
      setUpdateMessage("Installing update. The app will restart.");
    } catch (err) {
      setUpdateStatus("error");
      setUpdateMessage(err instanceof Error ? err.message : "Failed to install update.");
    }
  };

  const timeString = format(time, "HH:mm:ss");
  const dateString = format(time, "EEEE d MMMM yyyy", { locale: sv });
  const currentSecond = time.getSeconds();
  const runningOrderClockSize = Math.min(width * 0.35, 280);
  const defaultClockSize = Math.min(width * 0.9, 500);
  const clockSize = mode === "running-order" ? runningOrderClockSize : defaultClockSize;
  const isRunningOrder = mode === "running-order";
  const logoClassName = isRunningOrder ? "w-16 sm:w-20 opacity-30" : "w-28 sm:w-36 opacity-30";
  const digitalClassName = isRunningOrder
    ? "text-2xl sm:text-3xl md:text-4xl lg:text-5xl"
    : "text-4xl sm:text-5xl md:text-6xl lg:text-7xl";
  const digitalStandaloneClassName = isRunningOrder
    ? "text-4xl sm:text-5xl md:text-6xl lg:text-7xl"
    : "text-6xl sm:text-7xl md:text-8xl lg:text-9xl";
  const showMicIndicator = x32Config.enabled && x32Config.showIndicator && isTauri;
  const micLive = x32State.anyLive;
  const casparRunningOrderEnabled = isTauri && casparConfig.enabled;
  const resolvedTitleText = titleText.trim().length > 0 ? titleText.trim() : "Studioklocka";
  const showTricasterCountdown = tricasterConfig.enabled && tricasterConfig.showCountdown;
  const showTricasterRecording = tricasterRecordConfig.enabled && tricasterRecordConfig.showIndicator;
  const isRedStackWatchface = watchface === "red-stack";
  const showRingLayout = showSecondsRing && !isRedStackWatchface;
  const effectiveLayoutOffsetX = isRedStackWatchface ? RED_FACE_CENTER_CORRECTION_X : layoutOffsetX;

  const tricasterRecordingPillClass = (recording: boolean | null) =>
    `rounded-full px-3 py-1 text-xs uppercase tracking-[0.35em] ${
      recording
        ? "bg-rose-500/90 text-white shadow-[0_0_14px_rgba(244,63,94,0.55)]"
        : "bg-foreground/10 text-muted-foreground"
    }`;

  const tricasterRecordingLabel = (recording: boolean | null) => {
    if (recording == null) return "TRICASTER --";
    return recording ? "TRICASTER REC" : "TRICASTER IDLE";
  };

  const clockContent = useMemo(
    () => (
      <div
        className="flex flex-col items-center gap-6 sm:gap-8 transition-transform duration-200"
        style={{ transform: `translateX(${effectiveLayoutOffsetX}px) scale(${zoom})`, transformOrigin: "center center" }}
      >
        {showTitle && (
          <h1
            className="text-muted-foreground text-xl sm:text-2xl md:text-3xl font-light tracking-[0.4em] uppercase"
            style={isRedStackWatchface ? { transform: `translateX(${RED_FACE_ADORNMENT_CORRECTION_X}px)` } : undefined}
          >
            {resolvedTitleText}
          </h1>
        )}
        {(showTricasterRecording || showMicIndicator) && (
          <div className="flex flex-wrap items-center gap-3">
            {showTricasterRecording && (
              <div className={tricasterRecordingPillClass(tricasterRecordState.recording)}>
                {tricasterRecordingLabel(tricasterRecordState.recording)}
              </div>
            )}
            {showMicIndicator && (
              <div
                className={`rounded-full px-4 py-1 text-xs uppercase tracking-[0.35em] ${
                  micLive
                    ? "bg-rose-500/90 text-white shadow-[0_0_14px_rgba(244,63,94,0.55)]"
                    : "bg-emerald-500/10 text-emerald-200"
                }`}
              >
                {micLive ? "Mic live" : "Mics muted"}
                {liveChannels.length > 0 ? ` • ${liveChannels.length}` : ""}
              </div>
            )}
          </div>
        )}

        {showRingLayout ? (
          <div className="relative flex w-full items-center justify-center">
            <div className="relative flex items-center justify-center" style={{ width: clockSize, height: clockSize }}>
              <SecondsRing currentSecond={currentSecond} size={clockSize} />

              {showLogo && logoDataUrl && (
                <img
                  src={logoDataUrl}
                  alt="Studio logo"
                  className={`absolute top-[18%] left-1/2 -translate-x-1/2 ${logoClassName}`}
                  style={invertLogo ? { filter: "invert(1)" } : undefined}
                />
              )}

              <div className="absolute inset-0 flex items-center justify-center">
                <DigitalDisplay time={timeString} className={digitalClassName} />
              </div>
              {showTricasterCountdown && (
                <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(100% + ${ddrGap}px)` }}>
                  <DdrCountdown
                    label={tricasterConfig.label}
                    seconds={tricasterCountdown.remainingSeconds}
                    active={tricasterCountdown.active}
                    size="lg"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative flex w-full items-center justify-center">
            {isRedStackWatchface ? (
              <div className="relative inline-flex flex-col items-center gap-4 pb-28">
                {showLogo && logoDataUrl && (
                  <img
                    src={logoDataUrl}
                    alt="Logo"
                    className={logoClassName}
                    style={invertLogo ? { filter: "invert(1)" } : undefined}
                  />
                )}
                <div className="flex w-[8ch] justify-center">
                  <DigitalDisplay time={timeString} className={`${digitalStandaloneClassName} w-[8ch] text-center`} />
                </div>
                {showTricasterCountdown && (
                  <div
                    className="absolute left-1/2 top-full mt-3"
                    style={{ transform: `translate(calc(-50% + ${redFaceDdrOffsetX}px), 0)` }}
                  >
                    <DdrCountdown
                      label={tricasterConfig.label}
                      seconds={tricasterCountdown.remainingSeconds}
                      active={tricasterCountdown.active}
                      size="xl"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="relative inline-flex flex-col items-center gap-4">
                {showLogo && logoDataUrl && (
                  <img
                    src={logoDataUrl}
                    alt="Logo"
                    className={logoClassName}
                    style={invertLogo ? { filter: "invert(1)" } : undefined}
                  />
                )}

                <DigitalDisplay time={timeString} className={digitalStandaloneClassName} />
                {showTricasterCountdown && (
                  <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(100% + ${ddrGap}px)` }}>
                    <DdrCountdown
                      label={tricasterConfig.label}
                      seconds={tricasterCountdown.remainingSeconds}
                      active={tricasterCountdown.active}
                      size="lg"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showDate && (
          <div
            className="text-muted-foreground text-lg sm:text-xl md:text-2xl font-light tracking-wide"
            style={isRedStackWatchface ? { transform: `translateX(${RED_FACE_ADORNMENT_CORRECTION_X}px)` } : undefined}
          >
            {dateString}
          </div>
        )}

        {showStopwatch && (
          <>
            <div className="w-48 h-px bg-border" />
            <Stopwatch />
          </>
        )}
      </div>
    ),
    [
      clockSize,
      currentSecond,
      dateString,
      liveChannels.length,
      micLive,
      showMicIndicator,
      showDate,
      showLogo,
      showRingLayout,
      showSecondsRing,
      showStopwatch,
      showTitle,
      showTricasterCountdown,
      showTricasterRecording,
      timeString,
      tricasterRecordState.recording,
      tricasterConfig.label,
      tricasterCountdown.active,
      tricasterCountdown.remainingSeconds,
      resolvedTitleText,
      layoutOffsetX,
      effectiveLayoutOffsetX,
      ddrGap,
      isRedStackWatchface,
      zoom,
    ],
  );

  const containerClassName =
    mode === "running-order"
      ? "min-h-screen bg-background flex flex-col items-stretch justify-start p-4 sm:p-8 relative overflow-hidden"
      : "min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden";

  return (
    <div className={containerClassName}>
      {/* Controls Dropdown */}
      <div className="absolute top-4 left-4 z-10">
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-primary hover:bg-secondary"
              title="Open menu"
            >
              <ChevronDown className="h-5 w-5 data-[state=open]:animate-[spin_0.2s_linear]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Mode</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setMode("clock");
              }}
              className="flex items-center justify-between"
            >
              <span>Clock</span>
              {mode === "clock" && <span className="text-xs text-muted-foreground">Active</span>}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setMode("running-order");
              }}
              className="flex items-center justify-between"
            >
              <span>Running order</span>
              {mode === "running-order" && <span className="text-xs text-muted-foreground">Active</span>}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setMode("settings");
              }}
              className="flex items-center justify-between"
            >
              <span>Settings</span>
              {mode === "settings" && <span className="text-xs text-muted-foreground">Active</span>}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async (event) => {
                event.preventDefault();
                if (isTauri) {
                  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
                  new WebviewWindow("running-order", {
                    url: "/running-order",
                    title: "Running order",
                    width: 1280,
                    height: 720,
                  });
                } else {
                  window.open("/running-order", "RunningOrder", "width=1280,height=720");
                }
                if (keepClockOnPopout) {
                  setMode("clock");
                }
              }}
              className="flex items-center gap-2"
            >
              <span>Pop out running order</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Display</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={showTitle}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(v) => setShowTitle(v === true)}
            >
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                <span>Title</span>
              </div>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showLogo}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(v) => setShowLogo(v === true)}
              disabled={!logoDataUrl}
            >
              <div className="flex items-center gap-2">
                <span>Logo</span>
              </div>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showDate}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(v) => setShowDate(v === true)}
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Date</span>
              </div>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showStopwatch}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(v) => setShowStopwatch(v === true)}
            >
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4" />
                <span>Stopwatch</span>
              </div>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showSecondsRing}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(v) => setShowSecondsRing(v === true)}
              disabled={isRedStackWatchface}
            >
              <div className="flex items-center gap-2">
                <Circle className="h-4 w-4" />
                <span>Seconds ring</span>
              </div>
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>View</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleZoomOut();
              }}
              disabled={zoom <= 0.3}
              className="flex items-center gap-2"
            >
              <Minus className="h-4 w-4" />
              <span>Zoom out</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleZoomIn();
              }}
              disabled={zoom >= 2.5}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>Zoom in</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                toggleFullscreen();
              }}
              className="flex items-center gap-2"
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              <span>{isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {mode === "clock" ? (
        <div className="flex flex-col items-center justify-center">{clockContent}</div>
      ) : mode === "running-order" ? (
        <div className="flex w-full flex-1 items-stretch justify-center gap-6 pt-16">
          <ErrorBoundary fallbackTitle="Running order error" onReset={() => setMode("clock")}>
            <RunningOrderLayout
              now={time}
              persistKey="studio_timepiece_running_order_v1"
              syncFromStorage
              casparControls={
                casparRunningOrderEnabled
                  ? {
                      available: true,
                      playTemplate: (template, data) => playCasparTemplateWith(template, data),
                      updateTemplate: (data) => updateCasparTemplateWith(data),
                      stopTemplate: () => stopCasparTemplate(),
                    }
                  : undefined
              }
              popoutClockEnabled={keepClockOnPopout}
              onTogglePopoutClock={setKeepClockOnPopout}
              ddrCountdownSlot={
                showTricasterCountdown ? (
                  <DdrCountdown
                    label={tricasterConfig.label}
                    seconds={tricasterCountdown.remainingSeconds}
                    active={tricasterCountdown.active}
                    size="sm"
                  />
                ) : null
              }
              clockSlot={
                <div className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
                  <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Clock</div>
                  <div className="mt-4 flex flex-col items-center">
                    <DigitalDisplay time={timeString} className="text-3xl sm:text-4xl md:text-5xl" />
                    <div className="mt-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">{dateString}</div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Keep clock visible when popped out</span>
                    <Switch checked={keepClockOnPopout} onCheckedChange={setKeepClockOnPopout} />
                  </div>
                </div>
              }
            />
          </ErrorBoundary>
        </div>
      ) : (
        <div className="flex w-full flex-1 flex-col items-center justify-start gap-6 pt-20 lg:flex-row lg:items-start lg:justify-center">
          <div className="w-full max-w-xl rounded-xl border border-border/60 bg-card/80 p-6 shadow-sm backdrop-blur">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Settings</div>
            <div className="mt-4 text-lg font-semibold text-foreground">Clock source</div>
            <div className="mt-1 text-sm text-muted-foreground">{statusLabel}</div>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant={clockSource === "local" ? "default" : "outline"}
                onClick={() => setClockSource("local")}
              >
                Offline computer clock
              </Button>
              <Button
                variant={clockSource === "world" ? "default" : "outline"}
                onClick={() => setClockSource("world")}
              >
                World clock
              </Button>
            </div>
            {lastSync && (
              <div className="mt-4 text-xs text-muted-foreground">Last sync: {format(lastSync, "HH:mm:ss")}</div>
            )}

            <div className="mt-8 border-t border-border/60 pt-6">
              <div className="text-lg font-semibold text-foreground">Watchface</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Choose between the classic ring face and a red stacked face with DDR below the clock.
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant={watchface === "classic" ? "default" : "outline"}
                  onClick={() => setWatchface("classic")}
                >
                  Classic
                </Button>
                <Button
                  type="button"
                  variant={watchface === "red-stack" ? "default" : "outline"}
                  onClick={() => setWatchface("red-stack")}
                >
                  Red stacked
                </Button>
              </div>
              {isRedStackWatchface && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Red stacked hides the seconds ring and places the DDR countdown under the clock.
                </div>
              )}
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <div className="text-lg font-semibold text-foreground">Layout</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Shift the whole clock composition and control how far the DDR countdown sits from the clock.
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Global zoom ({Math.round(zoom * 100)}%)
                  <input
                    type="range"
                    min={30}
                    max={250}
                    step={5}
                    value={Math.round(zoom * 100)}
                    onChange={(event) => setZoom(Number(event.target.value) / 100)}
                    className="w-full"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Horizontal shift ({layoutOffsetX}px)
                  <input
                    type="range"
                    min={-600}
                    max={600}
                    step={10}
                    value={layoutOffsetX}
                    onChange={(event) => setLayoutOffsetX(Number(event.target.value))}
                    disabled={isRedStackWatchface}
                    className="w-full"
                  />
                </label>
              </div>
              <div className="mt-3">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  DDR spacing ({ddrGap}px)
                  <input
                    type="range"
                    min={0}
                    max={320}
                    step={4}
                    value={ddrGap}
                    onChange={(event) => setDdrGap(Number(event.target.value))}
                    disabled={!showTricasterCountdown}
                    className="w-full"
                  />
                </label>
              </div>
              {isRedStackWatchface && (
                <div className="mt-3">
                  <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                    Red face DDR nudge ({redFaceDdrOffsetX}px)
                    <input
                      type="range"
                      min={-160}
                      max={160}
                      step={1}
                      value={redFaceDdrOffsetX}
                      onChange={(event) => setRedFaceDdrOffsetX(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                </div>
              )}
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setZoom(1);
                    setLayoutOffsetX(0);
                    setDdrGap(56);
                    setRedFaceClockOffsetX(RED_FACE_CLOCK_OFFSET_DEFAULT);
                    setRedFaceDdrOffsetX(RED_FACE_DDR_OFFSET_DEFAULT);
                  }}
                >
                  Reset layout defaults
                </Button>
              </div>
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <div className="text-lg font-semibold text-foreground">Title text</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Set a custom title for the top of the clock face.
              </div>
              <label className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
                Text
                <input
                  value={titleText}
                  onChange={(event) => setTitleText(event.target.value)}
                  className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                  placeholder="Studioklocka"
                />
              </label>
              <div className="mt-2 text-xs text-muted-foreground">Leave empty to use the default title.</div>
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <div className="text-lg font-semibold text-foreground">App updates</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {isTauri ? `Current version: ${appVersion ?? "Unknown"}` : "Only available in the desktop app"}
              </div>
              {isTauri && (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCheckUpdates}
                      disabled={updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing"}
                    >
                      {updateStatus === "checking" ? "Checking..." : "Check for updates"}
                    </Button>
                    {availableUpdate && (
                      <Button
                        type="button"
                        onClick={handleInstallUpdate}
                        disabled={updateStatus === "downloading" || updateStatus === "installing"}
                      >
                        {updateStatus === "downloading" ? "Downloading..." : "Update now"}
                      </Button>
                    )}
                  </div>
                  {updateMessage && <div className="text-xs text-muted-foreground">{updateMessage}</div>}
                </div>
              )}
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <div className="text-lg font-semibold text-foreground">Logo</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Upload a custom logo to show on the watch face. Use a transparent PNG with a light/white (negative)
                mark for best results on the dark background.
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {logoDataUrl ? (
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 rounded-md border border-border/60 bg-foreground/10 p-2">
                      <img
                        src={logoDataUrl}
                        alt="Logo preview"
                        className="h-full w-full object-contain"
                        style={invertLogo ? { filter: "invert(1)" } : undefined}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">Preview</div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No logo uploaded yet.</div>
                )}
                {logoIsDark && (
                  <>
                    <div className="text-xs text-amber-200">
                      This logo looks dark. Consider a light/white (negative) version for better visibility.
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={invertLogo} onCheckedChange={setInvertLogo} disabled={!logoDataUrl} />
                      <span className="text-sm text-muted-foreground">Invert logo colors</span>
                    </div>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = typeof reader.result === "string" ? reader.result : null;
                      setLogoDataUrl(result);
                      setShowLogo(true);
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                />
                <div className="flex items-center gap-3">
                  <Switch checked={showLogo} onCheckedChange={setShowLogo} disabled={!logoDataUrl} />
                  <span className="text-sm text-muted-foreground">Show logo on clock</span>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setLogoDataUrl(null);
                    }}
                    disabled={!logoDataUrl}
                  >
                    Remove logo
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Logo is stored locally on this device.
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <div className="text-lg font-semibold text-foreground">CasparCG graphics playout</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {isTauri
                  ? casparConfig.enabled
                    ? casparState.status === "error"
                      ? `Error: ${casparState.error ?? "Unable to connect"}`
                      : "Ready to send AMCP commands"
                    : "Disabled"
                  : "Only available in the Tauri app"}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Switch
                  checked={casparConfig.enabled}
                  onCheckedChange={(value) => setCasparConfig({ enabled: value })}
                />
                <span className="text-sm text-muted-foreground">Enable CasparCG control</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  CasparCG host
                  <input
                    value={casparConfig.host}
                    onChange={(event) => setCasparConfig({ host: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="127.0.0.1"
                    disabled={!casparConfig.enabled}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  AMCP port
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={casparConfig.port}
                    onChange={(event) => setCasparConfig({ port: Number(event.target.value) || 0 })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="5250"
                    disabled={!casparConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Channel
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={casparConfig.channel}
                    onChange={(event) => setCasparConfig({ channel: Number(event.target.value) || 1 })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="1"
                    disabled={!casparConfig.enabled}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Layer
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    value={casparConfig.layer}
                    onChange={(event) => setCasparConfig({ layer: Number(event.target.value) || 0 })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="20"
                    disabled={!casparConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-3">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Template name
                  <input
                    value={casparConfig.template}
                    onChange={(event) => setCasparConfig({ template: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="my_lower_third"
                    disabled={!casparConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-3">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Template data (JSON/XML string)
                  <textarea
                    value={casparConfig.data}
                    onChange={(event) => setCasparConfig({ data: event.target.value })}
                    className="min-h-20 rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder='{"f0":"Headline","f1":"Name"}'
                    disabled={!casparConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-3">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Local template root path
                  <input
                    value={casparConfig.templateRootPath}
                    onChange={(event) => setCasparConfig({ templateRootPath: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="/path/to/CasparCG/server/template"
                    disabled={!casparConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-3">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Upload target file name (optional)
                  <input
                    value={casparUploadPath}
                    onChange={(event) => setCasparUploadPath(event.target.value)}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="news/lower_third.html"
                    disabled={!casparConfig.enabled}
                  />
                </label>
                <div className="mt-1 text-xs text-muted-foreground">
                  If empty, the selected file name is used.
                </div>
              </div>
              <div className="mt-3">
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="file"
                    accept=".html,.htm,.json,.js,.css,.xml,.ft"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const result = typeof reader.result === "string" ? reader.result : null;
                        if (result == null) return;
                        const relativePath = casparUploadPath.trim() || file.name;
                        await uploadCasparTemplateFile(relativePath, result);
                      };
                      reader.readAsText(file);
                      event.currentTarget.value = "";
                    }}
                    disabled={!casparConfig.enabled || !isTauri}
                  />
                  <span className="rounded-md border border-border/60 px-3 py-2 text-sm font-medium shadow-sm">
                    Add template file
                  </span>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={pingCaspar} disabled={!casparConfig.enabled || !isTauri}>
                  Test connection
                </Button>
                <Button type="button" onClick={playCasparTemplate} disabled={!casparConfig.enabled || !isTauri}>
                  Play template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={updateCasparTemplate}
                  disabled={!casparConfig.enabled || !isTauri}
                >
                  Update template
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={stopCasparTemplate}
                  disabled={!casparConfig.enabled || !isTauri}
                >
                  Stop template
                </Button>
              </div>
              {casparState.lastResponse && (
                <div className="mt-2 text-xs text-muted-foreground">CasparCG response: {casparState.lastResponse}</div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                Uses AMCP over TCP. Make sure your local CasparCG server is running and reachable on the configured host
                and port.
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Template upload writes files to the local template root path from this app process.
              </div>
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <div className="text-lg font-semibold text-foreground">X32 mic live</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {isTauri
                  ? x32State.status === "error"
                    ? `Error: ${x32State.error ?? "Unable to connect"}`
                    : x32State.status === "listening"
                      ? "Listening for mic status"
                      : "Disabled"
                  : "Only available in the Tauri app"}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Switch
                  checked={x32Config.enabled}
                  onCheckedChange={(value) => setX32Config({ enabled: value })}
                />
                <span className="text-sm text-muted-foreground">Enable mic live indicator</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Switch
                  checked={x32Config.showIndicator}
                  onCheckedChange={(value) => setX32Config({ showIndicator: value })}
                  disabled={!x32Config.enabled}
                />
                <span className="text-sm text-muted-foreground">Show mic indicator on clock</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  X32 host
                  <input
                    value={x32Config.host}
                    onChange={(event) => setX32Config({ host: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="192.168.0.100"
                    disabled={!x32Config.enabled}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  OSC port
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={x32Config.port}
                    onChange={(event) => setX32Config({ port: Number(event.target.value) || 0 })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="10023"
                    disabled={!x32Config.enabled}
                  />
                </label>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Channels: 1–6 • Live = unmuted + fader above -inf</div>
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <div className="text-lg font-semibold text-foreground">TriCaster DDR countdown</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {tricasterConfig.enabled
                  ? tricasterState.status === "error"
                    ? `Error: ${tricasterState.error ?? "Unable to connect"}`
                    : tricasterState.status === "listening"
                      ? "Listening for DDR state"
                      : "Connecting"
                  : "Disabled"}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Switch
                  checked={tricasterConfig.enabled}
                  onCheckedChange={(value) => setTricasterConfig({ enabled: value })}
                />
                <span className="text-sm text-muted-foreground">Enable TriCaster DDR integration</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Switch
                  checked={tricasterConfig.showCountdown}
                  onCheckedChange={(value) => setTricasterConfig({ showCountdown: value })}
                  disabled={!tricasterConfig.enabled}
                />
                <span className="text-sm text-muted-foreground">Show DDR countdown on clock</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  TriCaster host
                  <input
                    value={tricasterConfig.host}
                    onChange={(event) => setTricasterConfig({ host: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="192.168.0.100:5951"
                    disabled={!tricasterConfig.enabled}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Label text
                  <input
                    value={tricasterConfig.label}
                    onChange={(event) => setTricasterConfig({ label: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="Inslag"
                    disabled={!tricasterConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Username
                  <input
                    value={tricasterConfig.username}
                    onChange={(event) => setTricasterConfig({ username: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="admin"
                    disabled={!tricasterConfig.enabled}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Password
                  <input
                    type="password"
                    value={tricasterConfig.password}
                    onChange={(event) => setTricasterConfig({ password: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="password"
                    disabled={!tricasterConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-3">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Remaining time state pattern
                  <input
                    value={tricasterConfig.remainingStatePattern}
                    onChange={(event) => setTricasterConfig({ remainingStatePattern: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="ddr{n}_time_remaining"
                    disabled={!tricasterConfig.enabled}
                  />
                </label>
                <div className="mt-1 text-xs text-muted-foreground">
                  Use &#123;n&#125; for DDR number. Find state names via `/v1/dictionary?key=shortcut_states`.
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Switch
                  checked={tricasterConfig.useEstimatedCountdown}
                  onCheckedChange={(value) => setTricasterConfig({ useEstimatedCountdown: value })}
                  disabled={!tricasterConfig.enabled}
                />
                <span className="text-sm text-muted-foreground">Use estimated fallback countdown from DDR play</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Play state pattern
                  <input
                    value={tricasterConfig.playStatePattern}
                    onChange={(event) => setTricasterConfig({ playStatePattern: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="ddr{n}_play"
                    disabled={!tricasterConfig.enabled}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Estimated clip length (seconds)
                  <input
                    type="number"
                    min={1}
                    value={tricasterConfig.estimatedDurationSeconds}
                    onChange={(event) =>
                      setTricasterConfig({ estimatedDurationSeconds: Math.max(1, Number(event.target.value) || 1) })
                    }
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="30"
                    disabled={!tricasterConfig.enabled || !tricasterConfig.useEstimatedCountdown}
                  />
                </label>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Uses TriCaster shortcut state notifications. Ensure the TriCaster API is enabled and accessible on port
                5951.
              </div>
              <div className="mt-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div>Debug • Active DDR: {tricasterCountdown.activeDdr ?? "--"}</div>
                <div>Debug • Countdown active: {tricasterCountdown.active ? "yes" : "no"}</div>
                <div>Debug • Remaining seconds: {tricasterCountdown.remainingSeconds ?? "--"}</div>
                <div>
                  Debug • Program tally: {tricasterState.programTally.length > 0 ? tricasterState.programTally.join(" | ") : "--"}
                </div>
                <div>
                  Debug • DDR play states:{" "}
                  {Object.entries(tricasterState.playingByDdr ?? {}).length > 0
                    ? Object.entries(tricasterState.playingByDdr)
                        .map(([ddr, entry]) => `DDR${ddr}:${entry.playing ? "play" : "stop"}`)
                        .join(" | ")
                    : "--"}
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <div className="text-lg font-semibold text-foreground">TriCaster recording</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {tricasterRecordConfig.enabled
                  ? tricasterRecordState.status === "error"
                    ? `Error: ${tricasterRecordState.error ?? "Unable to connect"}`
                    : tricasterRecordState.status === "listening"
                      ? "Listening for recording state"
                      : tricasterRecordState.status === "connecting"
                        ? "Connecting"
                        : "Disabled"
                  : "Disabled"}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Switch
                  checked={tricasterRecordConfig.enabled}
                  onCheckedChange={(value) => setTricasterRecordConfig({ enabled: value })}
                />
                <span className="text-sm text-muted-foreground">Enable TriCaster recording</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Switch
                  checked={tricasterRecordConfig.showIndicator}
                  onCheckedChange={(value) => setTricasterRecordConfig({ showIndicator: value })}
                  disabled={!tricasterRecordConfig.enabled}
                />
                <span className="text-sm text-muted-foreground">Show recording status on clock</span>
              </div>
              <div className="mt-4">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  TriCaster host
                  <input
                    value={tricasterRecordConfig.host}
                    onChange={(event) => setTricasterRecordConfig({ host: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="192.168.0.101:5951"
                    disabled={!tricasterRecordConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Username
                  <input
                    value={tricasterRecordConfig.username}
                    onChange={(event) => setTricasterRecordConfig({ username: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="admin"
                    disabled={!tricasterRecordConfig.enabled}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Password
                  <input
                    type="password"
                    value={tricasterRecordConfig.password}
                    onChange={(event) => setTricasterRecordConfig({ password: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="password"
                    disabled={!tricasterRecordConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-3">
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Record state name
                  <input
                    value={tricasterRecordConfig.stateName}
                    onChange={(event) => setTricasterRecordConfig({ stateName: event.target.value })}
                    className="rounded-md border border-border/60 bg-transparent px-2 py-2 text-sm text-foreground"
                    placeholder="recording"
                    disabled={!tricasterRecordConfig.enabled}
                  />
                </label>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Use shortcut state names (via `/v1/dictionary?key=shortcut_states`). Recording values should be true/false
                or 1/0.
              </div>
            </div>
          </div>
          <div className="w-full max-w-[720px] rounded-xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur">
            <div className="mb-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">Live preview</div>
            <div className="flex min-h-[380px] items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-background/70 p-4">
              {clockContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioClock;
