export function formatBytesPerSec(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB/s`;
  if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)} MB/s`;
  if (n >= 1024)          return `${(n / 1024).toFixed(1)} KB/s`;
  return `${n.toFixed(0)} B/s`;
}
