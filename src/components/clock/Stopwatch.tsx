import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

const Stopwatch = () => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds
      .toString()
      .padStart(2, "0")}`;
  };

  const start = useCallback(() => {
    if (!isRunning) {
      startTimeRef.current = Date.now() - time;
      intervalRef.current = window.setInterval(() => {
        setTime(Date.now() - startTimeRef.current);
      }, 10);
      setIsRunning(true);
    }
  }, [isRunning, time]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTime(0);
  }, [stop]);

  const toggle = useCallback(() => {
    if (isRunning) {
      stop();
    } else {
      start();
    }
  }, [isRunning, start, stop]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {/* Dim background for LED effect */}
        <div 
          className="led-display led-dim absolute inset-0 text-2xl sm:text-3xl md:text-4xl select-none" 
          aria-hidden="true"
        >
          88:88:88.88
        </div>
        {/* Active display */}
        <div className="led-display text-primary text-2xl sm:text-3xl md:text-4xl relative">
          {formatTime(time)}
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={toggle}
          variant="outline"
          size="lg"
          className="border-primary text-primary hover:bg-primary hover:text-primary-foreground min-w-[100px]"
        >
          {isRunning ? (
            <>
              <Pause className="mr-2 h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Start
            </>
          )}
        </Button>
        <Button
          onClick={reset}
          variant="outline"
          size="lg"
          className="border-muted-foreground text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
      </div>
    </div>
  );
};

export default Stopwatch;
