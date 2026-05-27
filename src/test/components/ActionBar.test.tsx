import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionBar } from '../../components/ActionBar';

describe('ActionBar', () => {
  it('shows hint when no process selected', () => {
    render(<ActionBar selectedPid={null} onAction={() => {}} />);
    expect(screen.getByText(/Select a process/)).toBeTruthy();
  });

  it('shows action buttons when process selected', () => {
    render(<ActionBar selectedPid={42} onAction={() => {}} />);
    expect(screen.getByText('SIGKILL')).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
  });
});
