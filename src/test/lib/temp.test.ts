import { describe, it, expect } from 'vitest';
import { formatTemp } from '../../lib/temp';

describe('formatTemp', () => {
  it('renders °C unchanged', () => {
    expect(formatTemp(60, 'C')).toBe('60°C');
    expect(formatTemp(0, 'C')).toBe('0°C');
  });

  it('converts to °F', () => {
    expect(formatTemp(100, 'F')).toBe('212°F');
    expect(formatTemp(0, 'F')).toBe('32°F');
  });

  it('rounds to integer', () => {
    expect(formatTemp(36.5, 'C')).toBe('37°C');
  });
});
