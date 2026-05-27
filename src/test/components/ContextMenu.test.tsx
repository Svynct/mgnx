import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu } from '../../components/ContextMenu';

describe('ContextMenu', () => {
  it('renders all actions', () => {
    render(<ContextMenu x={0} y={0} pid={1} onClose={() => {}} />);
    expect(screen.getByText('SIGKILL')).toBeTruthy();
    expect(screen.getByText('SIGTERM')).toBeTruthy();
    expect(screen.getByText('Resume')).toBeTruthy();
    expect(screen.getByText('Suspend')).toBeTruthy();
    expect(screen.getByText('Renice…')).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
  });

  it('calls onClose when pressing Escape', async () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} pid={1} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
