import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useWindowSize } from "@/hooks/useWindowSize";
import { Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";
import SecondsRing from "./SecondsRing";
import DigitalDisplay from "./DigitalDisplay";
import Stopwatch from "./Stopwatch";

const StudioClock = () => {
  const [time, setTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  const timeString = format(time, "HH:mm:ss");
  const dateString = format(time, "EEEE, d MMMM yyyy");
  const currentSecond = time.getSeconds();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8 relative">
      {/* Fullscreen Toggle */}
      <Button
        onClick={toggleFullscreen}
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-muted-foreground hover:text-primary hover:bg-secondary z-10"
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <Minimize className="h-5 w-5" />
        ) : (
          <Maximize className="h-5 w-5" />
        )}
      </Button>

      {/* Main Clock Container */}
      <div className="flex flex-col items-center gap-6 sm:gap-8">
        {/* Clock Face with Seconds Ring */}
        <div className="relative flex items-center justify-center" style={{ width: 'min(90vw, 500px)', height: 'min(90vw, 500px)' }}>
          <SecondsRing 
            currentSecond={currentSecond} 
            size={Math.min(width * 0.9, 500)} 
          />
          
          {/* Digital Time Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <DigitalDisplay 
              time={timeString} 
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl"
            />
          </div>
        </div>

        {/* Date Display */}
        <div className="text-muted-foreground text-lg sm:text-xl md:text-2xl font-light tracking-wide">
          {dateString}
        </div>

        {/* Divider */}
        <div className="w-48 h-px bg-border" />

        {/* Stopwatch */}
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-muted-foreground text-sm uppercase tracking-widest">
            Stopwatch
          </h2>
          <Stopwatch />
        </div>
      </div>
    </div>
  );
};

export default StudioClock;
