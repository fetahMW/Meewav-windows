function formatLocalIsoDate(date: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatLocalDateTimeInput(date: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${formatLocalIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getMarketListingRelativeDate(days: number, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return formatLocalIsoDate(date);
}

export function getMarketListingRelativeDateTime(
  days: number,
  hour: number,
  minute: number,
  now = new Date(),
) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return formatLocalDateTimeInput(date);
}

export function getCurrentMarketListingDateTime(now = new Date()) {
  const date = new Date(now);
  date.setSeconds(0, 0);
  return formatLocalDateTimeInput(date);
}
