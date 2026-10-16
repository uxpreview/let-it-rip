// How a deal's days and hours read on the page: "Mon–Fri, 3–6pm", "Thursdays from 5pm".
// Hours are 24h numbers in half hours (15.5 = 3:30pm, 24 = midnight).

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function clock(h) {
  if (h >= 24) return "midnight";
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""}${hr < 12 ? "am" : "pm"}`;
}

// Monday first, with runs of three or more days joined: [1,2,3,4] -> "Mon–Thu".
export function dayList(days) {
  const set = new Set(days);
  if (set.size === 7) return "Daily";
  const week = [1, 2, 3, 4, 5, 6, 0];
  const picked = week.map((d, i) => (set.has(d) ? i : -1)).filter((i) => i >= 0);
  if (picked.length === 1) return `${DAY_NAMES[week[picked[0]]]}s`;
  const runs = [];
  for (const i of picked) {
    const run = runs[runs.length - 1];
    if (run && i === run[1] + 1) run[1] = i;
    else runs.push([i, i]);
  }
  const name = (i) => SHORT_DAYS[week[i]];
  const parts = runs.flatMap(([a, b]) => (b - a >= 2 ? [`${name(a)}–${name(b)}`] : a === b ? [name(a)] : [name(a), name(b)]));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function hoursText(when) {
  if (when.to == null) return `from ${clock(when.from)}`;
  const start = clock(when.from);
  const sameHalf = when.to < 24 && (when.from < 12) === (when.to < 12);
  return `${sameHalf ? start.replace(/am|pm/, "") : start}–${clock(when.to)}`;
}

export function schedule(when) {
  if (!when || !Array.isArray(when.days) || !when.days.length || when.from == null) return "";
  const days = dayList(when.days);
  return when.to == null ? `${days} ${hoursText(when)}` : `${days}, ${hoursText(when)}`;
}
