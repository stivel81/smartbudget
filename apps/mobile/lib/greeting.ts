// Pure time-of-day greeting used by the Dashboard header.

/**
 * Time-of-day greeting for the local hour of `date`:
 * 05–11 morning, 12–16 afternoon, 17–04 evening.
 */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}
