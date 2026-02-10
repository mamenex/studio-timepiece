import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useWindowSize } from "@/hooks/useWindowSize";
import { useClock } from "@/hooks/useClock";
import { useX32MicLive } from "@/hooks/useX32MicLive";
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
import ErrorBoundary from "@/components/ErrorBoundary";
import studioLogo from "@/assets/studio-logo.png";

const StudioClock = () => {
  const { now: time, source: clockSource, statusLabel, lastSync, setSource: setClockSource } = useClock();
  const { config: x32Config, setConfig: setX32Config, state: x32State, liveChannels, isTauri } = useX32MicLive();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStopwatch, setShowStopwatch] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [titleText, setTitleText] = useState("Studioklocka");
  const [showLogo, setShowLogo] = useState(true);
  const [showSecondsRing, setShowSecondsRing] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mode, setMode] = useState<"clock" | "running-order" | "settings">("clock");
  const [keepClockOnPopout, setKeepClockOnPopout] = useState(true);
  const { width } = useWindowSize();

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
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

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
    setZoom((prev) => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.1, 0.5));
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
  const resolvedTitleText = titleText.trim().length > 0 ? titleText.trim() : "Studioklocka";

  const clockContent = useMemo(
    () => (
      <div
        className="flex flex-col items-center gap-6 sm:gap-8 transition-transform duration-200"
        style={{ transform: `scale(${zoom})` }}
      >
        {showTitle && (
          <h1 className="text-muted-foreground text-xl sm:text-2xl md:text-3xl font-light tracking-[0.4em] uppercase">
            {resolvedTitleText}
          </h1>
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

        {showSecondsRing ? (
          <div className="relative flex items-center justify-center" style={{ width: clockSize, height: clockSize }}>
            <SecondsRing currentSecond={currentSecond} size={clockSize} />

            {showLogo && (
              <img
                src={studioLogo}
                alt="Studio logo"
                className={`absolute top-[18%] left-1/2 -translate-x-1/2 ${logoClassName}`}
              />
            )}

            <div className="absolute inset-0 flex items-center justify-center">
              <DigitalDisplay time={timeString} className={digitalClassName} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {showLogo && <img src={studioLogo} alt="Studio logo" className={logoClassName} />}

            <DigitalDisplay time={timeString} className={digitalStandaloneClassName} />
          </div>
        )}

        {showDate && (
          <div className="text-muted-foreground text-lg sm:text-xl md:text-2xl font-light tracking-wide">
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
      showSecondsRing,
      showStopwatch,
      showTitle,
      timeString,
      resolvedTitleText,
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
            >
              <div className="flex items-center gap-2">
                <img
                  src={studioLogo}
                  alt=""
                  className="h-4 w-4 object-contain"
                  style={{ clipPath: "inset(0 0 0 38%)", objectPosition: "right center" }}
                />
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
              disabled={zoom <= 0.5}
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
              disabled={zoom >= 2}
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
              popoutClockEnabled={keepClockOnPopout}
              onTogglePopoutClock={setKeepClockOnPopout}
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
        <div className="flex w-full flex-1 items-start justify-center pt-20">
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
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioClock;
