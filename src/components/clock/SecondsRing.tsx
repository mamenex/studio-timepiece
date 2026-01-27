import { cn } from "@/lib/utils";

interface SecondsRingProps {
  currentSecond: number;
  size?: number;
}

const SecondsRing = ({ currentSecond, size = 400 }: SecondsRingProps) => {
  const dots = Array.from({ length: 60 }, (_, i) => i);
  const radius = (size / 2) - 20;
  const centerOffset = size / 2;
  const dotSize = size > 300 ? 8 : 6;

  return (
    <div 
      className="absolute inset-0"
      style={{ width: size, height: size }}
    >
      {dots.map((dot) => {
        const angle = (dot * 6 - 90) * (Math.PI / 180);
        const x = centerOffset + radius * Math.cos(angle);
        const y = centerOffset + radius * Math.sin(angle);
        const isActive = dot <= currentSecond;
        const isMajor = dot % 5 === 0;

        return (
          <div
            key={dot}
            className={cn(
              "absolute rounded-full transition-all duration-100",
              isActive 
                ? "bg-primary led-dot" 
                : "led-dot-dim"
            )}
            style={{
              width: isMajor ? dotSize + 2 : dotSize,
              height: isMajor ? dotSize + 2 : dotSize,
              left: x - (isMajor ? (dotSize + 2) / 2 : dotSize / 2),
              top: y - (isMajor ? (dotSize + 2) / 2 : dotSize / 2),
            }}
          />
        );
      })}
    </div>
  );
};

export default SecondsRing;
