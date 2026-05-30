import { describe, it, expect } from 'vitest';
import { formatBytesPerSec } from '../../lib/format';

describe('formatBytesPerSec', () => {
  it('renders bytes for under-1KB values', () => {
    expect(formatBytesPerSec(0)).toBe('0 B/s');
    expect(formatBytesPerSec(512)).toBe('512 B/s');
  });

  it('renders KB/s for 1KB+ values', () => {
    expect(formatBytesPerSec(2048)).toBe('2.0 KB/s');
  });

  it('renders MB/s for 1MB+ values', () => {
    expect(formatBytesPerSec(5_242_880)).toBe('5.0 MB/s');
  });

  it('renders GB/s for 1GB+ values', () => {
    expect(formatBytesPerSec(2_147_483_648)).toBe('2.0 GB/s');
  });
});
