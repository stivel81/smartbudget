// Pure time-of-day greeting used by the Dashboard header.
import { firstNameOf } from './profile';

/**
 * Time-of-day greeting for the local hour of `date`:
 * 05–11 morning, 12–16 afternoon, 17–04 evening. With a `name`, addresses
 * the user by first name ("Good evening, Adrian"); without one, no name.
 */
export function greetingFor(date: Date, name?: string | null): string {
  const hour = date.getHours();
  let greeting: string;
  if (hour >= 5 && hour < 12) greeting = 'Good morning';
  else if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else greeting = 'Good evening';
  const firstName = firstNameOf(name);
  return firstName ? `${greeting}, ${firstName}` : greeting;
}
