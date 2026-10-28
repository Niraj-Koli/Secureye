const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** The original's report format for times into a video: "3.20 sec". */
export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)} sec`;
}

/** Video length for lists: "0:42", "12:05". */
export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}`;
}

/** File name for a downloaded clip: "track_3_army_vehicle.mp4". */
export function clipFileName(trackId: number, className: string): string {
  return `track_${String(trackId)}_${className.toLowerCase().replace(/\s+/g, "_")}.mp4`;
}

/** The original live report's timestamp, in local time: "21-October-2026 03:04 PM". */
export function formatLiveTimestamp(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")} ${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()}`;
}
