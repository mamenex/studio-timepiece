import { useClock } from "@/hooks/useClock";
import RunningOrderLayout from "@/components/clock/RunningOrderLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";

const RunningOrder = () => {
  const { now: time } = useClock();

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <ErrorBoundary fallbackTitle="Running order error">
        <RunningOrderLayout
          now={time}
          persistKey="studio_timepiece_running_order_v1"
          syncFromStorage
          clockSlot={
            <div className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted-foreground">
                <span>Clock</span>
                <Button variant="ghost" size="sm" onClick={() => window.close()}>
                  Close window
                </Button>
              </div>
              <div className="mt-4 flex flex-col items-center">
                <div className="text-sm text-muted-foreground">Live clock is in main view</div>
              </div>
            </div>
          }
        />
      </ErrorBoundary>
    </div>
  );
};

export default RunningOrder;
