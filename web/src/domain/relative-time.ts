export function relativeAge(value: string | null, now = Date.now(), showSeconds = false): string {
  if (!value) return "Waiting for first sync";
  const elapsed = Math.max(0, now - Date.parse(value));
  const seconds = Math.floor(elapsed / 1000);
  if (showSeconds && seconds < 60) return seconds < 2 ? "Updated just now" : `Updated ${seconds} seconds ago`;
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 minute ago";
  if (minutes < 60) return `Updated ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "Updated 1 hour ago" : `Updated ${hours} hours ago`;
}
