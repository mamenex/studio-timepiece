import { useState, useEffect } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useWindowSize } from "@/hooks/useWindowSize";
import { Maximize, Minimize, Timer, Calendar, Plus, Minus, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import SecondsRing from "./SecondsRing";
import DigitalDisplay from "./DigitalDisplay";
import Stopwatch from "./Stopwatch";
import studioLogo from "@/assets/studio-logo.png";

const StudioClock = () => {
  const [time, setTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStopwatch, setShowStopwatch] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [showLogo, setShowLogo] = useState(true);
  const [zoom, setZoom] = useState(1);
  const { width } = useWindowSize();

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 100);

    return () => clearInterval(interval);
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
  const dateString = format(time, "EEEE, d MMMM yyyy", { locale: sv });
  const currentSecond = time.getSeconds();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      {/* Top Left Controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        <Button
          onClick={() => setShowTitle(!showTitle)}
          variant="ghost"
          size="icon"
          className={`text-muted-foreground hover:text-primary hover:bg-secondary ${showTitle ? 'text-primary' : ''}`}
          title={showTitle ? "Hide title" : "Show title"}
        >
          <Type className="h-5 w-5" />
        </Button>
        <Button
          onClick={() => setShowLogo(!showLogo)}
          variant="ghost"
          size="icon"
          className={`text-muted-foreground hover:text-primary hover:bg-secondary ${showLogo ? 'opacity-100' : 'opacity-40'}`}
          title={showLogo ? "Hide logo" : "Show logo"}
        >
          <img 
            src={studioLogo} 
            alt="Toggle logo" 
            className="h-5 w-5 object-contain"
            style={{ clipPath: 'inset(0 0 0 38%)', objectPosition: 'right center' }}
          />
        </Button>
        <Button
          onClick={() => setShowDate(!showDate)}
          variant="ghost"
          size="icon"
          className={`text-muted-foreground hover:text-primary hover:bg-secondary ${showDate ? 'text-primary' : ''}`}
          title={showDate ? "Hide date" : "Show date"}
        >
          <Calendar className="h-5 w-5" />
        </Button>
        <Button
          onClick={() => setShowStopwatch(!showStopwatch)}
          variant="ghost"
          size="icon"
          className={`text-muted-foreground hover:text-primary hover:bg-secondary ${showStopwatch ? 'text-primary' : ''}`}
          title={showStopwatch ? "Hide stopwatch" : "Show stopwatch"}
        >
          <Timer className="h-5 w-5" />
        </Button>
      </div>

      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <Button
          onClick={handleZoomOut}
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-secondary"
          title="Zoom out"
          disabled={zoom <= 0.5}
        >
          <Minus className="h-5 w-5" />
        </Button>
        <Button
          onClick={handleZoomIn}
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-secondary"
          title="Zoom in"
          disabled={zoom >= 2}
        >
          <Plus className="h-5 w-5" />
        </Button>
        <Button
          onClick={toggleFullscreen}
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-secondary"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <Minimize className="h-5 w-5" />
          ) : (
            <Maximize className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Main Clock Container with Zoom */}
      <div 
        className="flex flex-col items-center gap-6 sm:gap-8 transition-transform duration-200"
        style={{ transform: `scale(${zoom})` }}
      >
        {/* Title */}
        {showTitle && (
          <h1 className="text-muted-foreground text-xl sm:text-2xl md:text-3xl font-light tracking-[0.4em] uppercase">
            Studioklocka
          </h1>
        )}

        {/* Clock Face with Seconds Ring */}
        <div className="relative flex items-center justify-center" style={{ width: 'min(90vw, 500px)', height: 'min(90vw, 500px)' }}>
          <SecondsRing 
            currentSecond={currentSecond} 
            size={Math.min(width * 0.9, 500)} 
          />
          
          {/* Logo - positioned between seconds ring and clock */}
          {showLogo && (
            <img 
              src={studioLogo} 
              alt="Studio logo" 
              className="absolute top-[18%] left-1/2 -translate-x-1/2 w-28 sm:w-36 opacity-30"
            />
          )}
          
          {/* Digital Time Display - centered */}
          <div className="absolute inset-0 flex items-center justify-center">
            <DigitalDisplay 
              time={timeString} 
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl"
            />
          </div>
        </div>

        {/* Date Display (togglable) */}
        {showDate && (
          <div className="text-muted-foreground text-lg sm:text-xl md:text-2xl font-light tracking-wide">
            {dateString}
          </div>
        )}

        {/* Stopwatch (togglable) */}
        {showStopwatch && (
          <>
            <div className="w-48 h-px bg-border" />
            <Stopwatch />
          </>
        )}
      </div>
    </div>
  );
};

export default StudioClock;
