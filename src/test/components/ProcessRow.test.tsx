import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProcessRow } from '../../components/ProcessRow';

const base = {
  pid: 42, ppid: 1, name: 'bash', cpu_percent: 0.5, memory_mb: 12.3,
  status: 'Running', user: 'alice', threads: 1,
  disk_read_bytes_per_sec: null, disk_write_bytes_per_sec: null,
  disk_read_total_mb: null, disk_write_total_mb: null,
  container_id: null,
};

const treeProps = {
  depth: 0, hasChildren: false, expanded: false, cpuAccum: 0.5, memAccum: 12.3,
  diskReadAccum: 0, diskWriteAccum: 0,
  diskReadHasData: false, diskWriteHasData: false,
};

describe('ProcessRow', () => {
  it('renders pid and name', () => {
    render(<table><tbody><ProcessRow proc={base} {...treeProps} selected={false}
      rowHeight={26} scrollMarginTop={30}
      onSelect={() => {}} onContextMenu={() => {}} onToggleFold={() => {}} /></tbody></table>);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('bash')).toBeTruthy();
  });

  it('applies red heat color at high CPU', () => {
    const { container } = render(
      <table><tbody><ProcessRow proc={{ ...base, cpu_percent: 20 }} {...treeProps} cpuAccum={20}
        selected={false} rowHeight={26} scrollMarginTop={30}
        onSelect={() => {}} onContextMenu={() => {}} onToggleFold={() => {}} /></tbody></table>
    );
    const row = container.querySelector('tr');
    expect(row?.getAttribute('data-heat')).toBe('red');
  });

  it('renders disk read rate when hasData and dash when not', () => {
    const { getByText, queryAllByText } = render(
      <table><tbody><ProcessRow
        proc={{ ...base, disk_read_bytes_per_sec: 5_242_880, disk_write_bytes_per_sec: null }}
        {...treeProps}
        diskReadAccum={5_242_880} diskReadHasData={true}
        diskWriteAccum={0} diskWriteHasData={false}
        selected={false} rowHeight={26} scrollMarginTop={30}
        onSelect={() => {}} onContextMenu={() => {}} onToggleFold={() => {}} /></tbody></table>
    );
    expect(getByText('5.0 MB/s')).toBeTruthy();
    expect(queryAllByText('—').length).toBeGreaterThan(0);
  });
});
