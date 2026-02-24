import { cn } from "@/lib/utils";

type DdrCountdownProps = {
  label: string;
  seconds: number | null;
  active: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const sizeClasses: Record<NonNullable<DdrCountdownProps["size"]>, { label: string; value: string }> = {
  sm: { label: "text-[10px] tracking-[0.25em]", value: "text-xl sm:text-2xl" },
  md: { label: "text-xs tracking-[0.3em]", value: "text-3xl sm:text-4xl" },
  lg: { label: "text-xs sm:text-sm tracking-[0.35em]", value: "text-4xl sm:text-5xl" },
};

const DdrCountdown = ({ label, seconds, active, size = "md", className }: DdrCountdownProps) => {
  const styles = sizeClasses[size];
  const displayValue = seconds != null ? formatDuration(seconds) : "--:--";
  const isCritical = seconds != null && Math.floor(seconds) <= 10;

  return (
    <div
      className={cn(
        "flex min-w-[120px] flex-col items-center justify-center rounded-xl border px-3 py-2 text-center shadow-sm backdrop-blur transition-colors duration-200",
        isCritical ? "border-red-300 bg-red-700" : "border-border/60 bg-card/70",
        active ? "opacity-100" : "opacity-0 pointer-events-none",
        className,
      )}
    >
      <div className={cn("uppercase", isCritical ? "text-red-100" : "text-muted-foreground", styles.label)}>{label}</div>
      <div className={cn("mt-1 font-semibold tabular-nums", isCritical ? "text-white" : "text-foreground", styles.value)}>
        {displayValue}
      </div>
    </div>
  );
};

export default DdrCountdown;
