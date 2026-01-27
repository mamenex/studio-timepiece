interface DigitalDisplayProps {
  time: string;
  className?: string;
}

const DigitalDisplay = ({ time, className = "" }: DigitalDisplayProps) => {
  return (
    <div className={`relative ${className}`}>
      {/* Dim background digits for LED effect */}
      <div className="led-display led-dim absolute inset-0 select-none" aria-hidden="true">
        88:88:88
      </div>
      {/* Active digits */}
      <div className="led-display text-primary relative">
        {time}
      </div>
    </div>
  );
};

export default DigitalDisplay;
