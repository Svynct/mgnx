import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProcessRow } from '../../components/ProcessRow';

const base = { pid: 42, name: 'bash', cpu_percent: 0.5, memory_mb: 12.3,
               status: 'Running', user: 'alice', threads: 1 };

describe('ProcessRow', () => {
  it('renders pid and name', () => {
    render(<table><tbody><ProcessRow proc={base} selected={false}
      onSelect={() => {}} onContextMenu={() => {}} /></tbody></table>);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('bash')).toBeTruthy();
  });

  it('applies red heat color at high CPU', () => {
    const { container } = render(
      <table><tbody><ProcessRow proc={{ ...base, cpu_percent: 20 }}
        selected={false} onSelect={() => {}} onContextMenu={() => {}} /></tbody></table>
    );
    const row = container.querySelector('tr');
    expect(row?.getAttribute('data-heat')).toBe('red');
  });
});
