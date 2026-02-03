import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useWindowSize } from "@/hooks/useWindowSize";
import { Maximize, Minimize, Timer, Calendar, Plus, Minus, Type, Circle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [time, setTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStopwatch, setShowStopwatch] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [showLogo, setShowLogo] = useState(true);
  const [showSecondsRing, setShowSecondsRing] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mode, setMode] = useState<"clock" | "running-order">("clock");
  const { width } = useWindowSize();

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 100);

    return () => clearInterval(interval);
  }, []);

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

  const clockContent = useMemo(
    () => (
      <div
        className="flex flex-col items-center gap-6 sm:gap-8 transition-transform duration-200"
        style={{ transform: `scale(${zoom})` }}
      >
        {showTitle && (
          <h1 className="text-muted-foreground text-xl sm:text-2xl md:text-3xl font-light tracking-[0.4em] uppercase">
            Studioklocka
          </h1>
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
      showDate,
      showLogo,
      showSecondsRing,
      showStopwatch,
      showTitle,
      timeString,
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
                window.open("/running-order", "RunningOrder", "width=1280,height=720");
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
      ) : (
        <div className="flex w-full flex-1 items-stretch justify-center gap-6 pt-16">
          <ErrorBoundary fallbackTitle="Running order error" onReset={() => setMode("clock")}>
          <RunningOrderLayout
            now={time}
            persistKey="studio_timepiece_running_order_v1"
            syncFromStorage
            clockSlot={
              <div className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Clock</div>
                <div className="mt-4 flex flex-col items-center">
                  <DigitalDisplay time={timeString} className="text-3xl sm:text-4xl md:text-5xl" />
                  <div className="mt-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">{dateString}</div>
                </div>
              </div>
            }
          />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
};

export default StudioClock;
