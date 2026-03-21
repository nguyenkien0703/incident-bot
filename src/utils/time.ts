/**
 * Time helpers
 */

export function get_current_time(): string {
  return new Date().toISOString();
}

export function generate_incident_id(now?: string, utcOffsetHours = 7): string {
  const utc = (now ? new Date(now) : new Date()).getTime();
  const local = new Date(utc + utcOffsetHours * 3600000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `INC-${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}-${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}`;
}

export function format_duration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Returns true if the given ISO time is within business hours 08:00-18:00 local (UTC+7 default) */
export function is_business_hours(isoTime: string, utcOffsetHours = 7): boolean {
  const utc = new Date(isoTime).getTime();
  const localHour = new Date(utc + utcOffsetHours * 3600000).getUTCHours();
  return localHour >= 8 && localHour < 18;
}
