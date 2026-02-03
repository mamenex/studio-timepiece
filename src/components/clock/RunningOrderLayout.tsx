import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import DigitalDisplay from "./DigitalDisplay";

type RunningOrderSegment = {
  id: string;
  segmentNumber: string;
  startSeconds: number | null;
  durationSeconds: number;
  type: string;
  rowIndex: number;
};

type RunningOrderState = {
  sourceName: string | null;
  segments: RunningOrderSegment[];
  showStartEnabled: boolean;
  showStartSeconds: number | null;
  skippedIds: string[];
};

type RunningOrderLayoutProps = {
  now: Date;
  persistKey?: string;
  syncFromStorage?: boolean;
  clockSlot?: ReactNode;
};

const STORAGE_VERSION = 1;

const formatClockTime = (seconds: number) => {
  const clamped = ((seconds % 86400) + 86400) % 86400;
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

const parseTimeCellToSeconds = (value: unknown) => {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return parsed.H * 3600 + parsed.M * 60 + Math.floor(parsed.S || 0);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(":").map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) return null;
    const [h = 0, m = 0, s = 0] = parts;
    return h * 3600 + m * 60 + s;
  }
  return null;
};

const parseDurationCellToSeconds = (value: unknown) => {
  if (value == null || value === "") return 0;
  if (value instanceof Date) {
    return value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  }
  if (typeof value === "number") {
    if (value > 0 && value <= 1) {
      return Math.round(value * 86400);
    }
    return Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parts = trimmed.split(":").map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) return 0;
    const [h = 0, m = 0, s = 0] = parts;
    return h * 3600 + m * 60 + s;
  }
  return 0;
};

const loadFromStorage = (persistKey?: string): RunningOrderState | null => {
  if (!persistKey) return null;
  try {
    const raw = window.localStorage.getItem(persistKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: number; state: RunningOrderState };
    if (parsed?.version !== STORAGE_VERSION) return null;
    return parsed.state;
  } catch {
    return null;
  }
};

const saveToStorage = (persistKey: string | undefined, state: RunningOrderState) => {
  if (!persistKey) return;
  window.localStorage.setItem(
    persistKey,
    JSON.stringify({
      version: STORAGE_VERSION,
      state,
    }),
  );
};

const RunningOrderLayout = ({ now, persistKey, syncFromStorage, clockSlot }: RunningOrderLayoutProps) => {
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [segments, setSegments] = useState<RunningOrderSegment[]>([]);
  const [showStartEnabled, setShowStartEnabled] = useState(false);
  const [showStartSeconds, setShowStartSeconds] = useState<number | null>(null);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!syncFromStorage) return;
    const stored = loadFromStorage(persistKey);
    if (stored) {
      setSourceName(stored.sourceName);
      setSegments(stored.segments);
      setShowStartEnabled(stored.showStartEnabled);
      setShowStartSeconds(stored.showStartSeconds);
      setSkippedIds(stored.skippedIds);
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== persistKey || !event.newValue) return;
      const parsed = loadFromStorage(persistKey);
      if (!parsed) return;
      setSourceName(parsed.sourceName);
      setSegments(parsed.segments);
      setShowStartEnabled(parsed.showStartEnabled);
      setShowStartSeconds(parsed.showStartSeconds);
      setSkippedIds(parsed.skippedIds);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [persistKey, syncFromStorage]);

  useEffect(() => {
    saveToStorage(persistKey, { sourceName, segments, showStartEnabled, showStartSeconds, skippedIds });
  }, [persistKey, sourceName, segments, showStartEnabled, showStartSeconds, skippedIds]);

  const handleFileUpload = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    const parsedSegments: RunningOrderSegment[] = [];
    for (let i = 3; i < rows.length; i += 1) {
      const row = rows[i] as unknown[];
      const segmentNumber = row?.[0];
      const startCell = row?.[1];
      const durationCell = row?.[2];
      const typeCell = row?.[3];

      if (
        (segmentNumber == null || segmentNumber === "") &&
        (startCell == null || startCell === "") &&
        (durationCell == null || durationCell === "") &&
        (typeCell == null || typeCell === "")
      ) {
        continue;
      }

      const startSeconds = parseTimeCellToSeconds(startCell);
      const durationSeconds = parseDurationCellToSeconds(durationCell);
      parsedSegments.push({
        id: `${i}-${segmentNumber ?? "segment"}`,
        segmentNumber: segmentNumber ? String(segmentNumber) : String(parsedSegments.length + 1),
        startSeconds,
        durationSeconds,
        type: typeCell ? String(typeCell) : "",
        rowIndex: i,
      });
    }

    const filledSegments = parsedSegments.map((segment, index, list) => {
      if (segment.startSeconds != null) return segment;
      const prev = list[index - 1];
      if (!prev || prev.startSeconds == null) return { ...segment, startSeconds: 0 };
      return { ...segment, startSeconds: prev.startSeconds + prev.durationSeconds };
    });

    setSourceName(file.name);
    setSegments(filledSegments);
    setSkippedIds([]);
  }, []);

  const baseStartSeconds = useMemo(() => {
    const first = segments.find((segment) => segment.startSeconds != null);
    return first?.startSeconds ?? 0;
  }, [segments]);

  const effectiveSegments = useMemo(() => {
    const offset = showStartEnabled && showStartSeconds != null ? showStartSeconds - baseStartSeconds : 0;
    let skippedDuration = 0;
    return segments.map((segment) => {
      const isSkipped = skippedIds.includes(segment.id);
      const startSeconds = (segment.startSeconds ?? 0) + offset - skippedDuration;
      const endSeconds = startSeconds + segment.durationSeconds;
      if (isSkipped) {
        skippedDuration += segment.durationSeconds;
      }
      return {
        ...segment,
        startSeconds,
        endSeconds,
        isSkipped,
      };
    });
  }, [segments, skippedIds, showStartEnabled, showStartSeconds, baseStartSeconds]);

  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const activeSegments = effectiveSegments.filter((segment) => !segment.isSkipped);
  const currentSegment = activeSegments.find(
    (segment) => nowSeconds >= segment.startSeconds && nowSeconds < segment.endSeconds,
  );
  const nextSegment = activeSegments.find((segment) => segment.startSeconds > nowSeconds);
  const showStart = activeSegments[0]?.startSeconds ?? null;
  const showEnd = activeSegments[activeSegments.length - 1]?.endSeconds ?? null;
  const showDurationSeconds =
    showStart != null && showEnd != null ? Math.max(0, showEnd - showStart) : 0;
  const showProgressValue =
    showStart != null && showEnd != null
      ? Math.min(100, Math.max(0, ((nowSeconds - showStart) / Math.max(1, showDurationSeconds)) * 100))
      : 0;
  const showRemainingSeconds =
    showEnd != null ? Math.max(0, showEnd - nowSeconds) : 0;

  const countdownTarget = currentSegment ? currentSegment.endSeconds : nextSegment?.startSeconds ?? null;
  const remainingSeconds = countdownTarget != null ? Math.max(0, countdownTarget - nowSeconds) : 0;
  const progressValue =
    currentSegment && currentSegment.durationSeconds > 0
      ? Math.min(100, ((nowSeconds - currentSegment.startSeconds) / currentSegment.durationSeconds) * 100)
      : 0;

  const handleToggleSkip = (segmentId: string) => {
    setSkippedIds((prev) =>
      prev.includes(segmentId) ? prev.filter((id) => id !== segmentId) : [...prev, segmentId],
    );
  };

  const handleJumpToSegment = (segmentId: string) => {
    const targetIndex = segments.findIndex((segment) => segment.id === segmentId);
    if (targetIndex < 0) return;

    const toSkip = segments.slice(0, targetIndex).map((segment) => segment.id);
    setSkippedIds((prev) => {
      const next = new Set(prev);
      toSkip.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const handleJumpToNext = () => {
    if (currentSegment) {
      handleToggleSkip(currentSegment.id);
      return;
    }
    if (nextSegment) {
      handleToggleSkip(nextSegment.id);
    }
  };

  const handleSetShowStartNow = () => {
    setShowStartEnabled(true);
    setShowStartSeconds(nowSeconds);
  };

  const handleShowStartChange = (value: string) => {
    const parts = value.split(":").map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) return;
    const [h = 0, m = 0, s = 0] = parts;
    setShowStartSeconds(h * 3600 + m * 60 + s);
  };

  const showStartValue =
    showStartSeconds != null ? formatClockTime(showStartSeconds) : formatClockTime(baseStartSeconds);

  return (
    <div className="flex h-full w-full gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Running Order</div>
              <div className="text-lg font-semibold text-foreground">
                {sourceName ? sourceName : "No running order loaded"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleFileUpload(file);
                    event.currentTarget.value = "";
                  }}
                />
                <span
                  className={`rounded-md px-3 py-2 text-sm font-medium shadow-sm transition ${
                    sourceName
                      ? "border border-emerald-400 bg-black text-emerald-300 hover:text-emerald-200"
                      : "bg-emerald-500 text-emerald-50 hover:bg-emerald-600"
                  }`}
                >
                  {sourceName ? "Excel loaded" : "Load Excel"}
                </span>
              </label>
              <Button variant="outline" size="sm" onClick={() => setSkippedIds([])}>
                Clear skips
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showStartEnabled}
                onChange={(event) => setShowStartEnabled(event.target.checked)}
              />
              Show start override
            </label>
            <input
              type="time"
              step={1}
              value={showStartValue}
              onChange={(event) => handleShowStartChange(event.target.value)}
              className="rounded-md border border-border/60 bg-transparent px-2 py-1 text-sm"
              disabled={!showStartEnabled}
            />
            <Button variant="outline" size="sm" onClick={handleSetShowStartNow}>
              Set show start to now
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-card/70 shadow-sm">
          <div className="flex h-full flex-col">
            <div className="border-b border-border/50 px-4 py-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Segments
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="space-y-3">
                {effectiveSegments.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
                    Load an Excel file to see the running order.
                  </div>
                )}
                {effectiveSegments.map((segment) => {
                  const isCurrent = currentSegment?.id === segment.id;
                  return (
                    <ContextMenu key={segment.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={`rounded-lg border px-4 py-3 transition ${
                            isCurrent
                              ? "border-primary/60 bg-primary/10"
                              : "border-border/60 bg-background/80 hover:bg-accent/40"
                          } ${segment.isSkipped ? "opacity-50" : ""}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm text-muted-foreground">Segment {segment.segmentNumber}</div>
                              <div className="text-lg font-semibold text-foreground">
                                {segment.type || "Untitled segment"}
                              </div>
                            </div>
                            <div className="text-right text-sm">
                              <div className="text-muted-foreground">Start</div>
                              <div className="font-medium text-foreground">{formatClockTime(segment.startSeconds)}</div>
                            </div>
                            <div className="text-right text-sm">
                              <div className="text-muted-foreground">Duration</div>
                              <div className="font-medium text-foreground">{formatDuration(segment.durationSeconds)}</div>
                            </div>
                          </div>
                          {segment.isSkipped && (
                            <div className="mt-2 text-xs uppercase text-muted-foreground">Skipped</div>
                          )}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onSelect={() => {
                            handleToggleSkip(segment.id);
                          }}
                        >
                          {segment.isSkipped ? "Unskip segment" : "Skip segment"}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => {
                            handleJumpToSegment(segment.id);
                          }}
                        >
                          Jump to here
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-[min(38vw,420px)] flex-col gap-4">
        {clockSlot ? (
          clockSlot
        ) : (
          <div className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Clock</div>
            <div className="mt-4 flex flex-col items-center gap-3">
              <DigitalDisplay time={format(now, "HH:mm:ss")} className="text-4xl sm:text-5xl" />
              <div className="text-sm text-muted-foreground">{format(now, "EEEE d MMMM yyyy", { locale: sv })}</div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Show Progress</div>
          <div className="mt-3">
            <Progress value={showProgressValue} indicatorClassName="bg-sky-500" />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{showStart != null ? `Start ${formatClockTime(showStart)}` : "No start"}</span>
              <span>{showEnd != null ? `End ${formatClockTime(showEnd)}` : "No end"}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Live Segment</div>
          <div className="mt-2 text-lg font-semibold text-foreground">
            {currentSegment ? currentSegment.type || "Untitled segment" : "No active segment"}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {currentSegment
              ? `Ends at ${formatClockTime(currentSegment.endSeconds)}`
              : nextSegment
                ? `Next at ${formatClockTime(nextSegment.startSeconds)}`
                : "No upcoming segments"}
          </div>
          <div className="mt-4">
            <Progress value={progressValue} />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{currentSegment ? `${Math.round(progressValue)}%` : "--"}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Countdown</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">
            {countdownTarget != null ? formatDuration(remainingSeconds) : "--:--"}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {currentSegment
              ? "Time remaining in current segment"
              : nextSegment
                ? "Time until next segment"
                : "Show complete"}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {showEnd != null ? `Show time left: ${formatDuration(showRemainingSeconds)}` : "Show time left: --:--"}
          </div>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={handleJumpToNext} disabled={!currentSegment && !nextSegment}>
              Next segment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RunningOrderLayout;
