import type { TempUnit } from '../stores/configStore';

export function formatTemp(c: number, unit: TempUnit): string {
  if (unit === 'F') return `${(c * 9 / 5 + 32).toFixed(0)}°F`;
  return `${c.toFixed(0)}°C`;
}
