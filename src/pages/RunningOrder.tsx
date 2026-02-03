import { useEffect, useState } from "react";
import RunningOrderLayout from "@/components/clock/RunningOrderLayout";

const RunningOrder = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <RunningOrderLayout now={time} persistKey="studio_timepiece_running_order_v1" syncFromStorage />
    </div>
  );
};

export default RunningOrder;
