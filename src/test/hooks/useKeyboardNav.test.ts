import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';

describe('useKeyboardNav', () => {
  it('starts in tabs zone', () => {
    const { result } = renderHook(() => useKeyboardNav('processes', false));
    expect(result.current.zone).toBe('tabs');
  });

  it('cycles to filters zone on Tab when on processes', () => {
    const { result } = renderHook(() => useKeyboardNav('processes', false));
    act(() => result.current.handleKey(new KeyboardEvent('keydown', { key: 'Tab' })));
    expect(result.current.zone).toBe('filters');
  });

  it('stays in tabs zone on Tab when not on processes tab', () => {
    const { result } = renderHook(() => useKeyboardNav('resources', false));
    act(() => result.current.handleKey(new KeyboardEvent('keydown', { key: 'Tab' })));
    expect(result.current.zone).toBe('tabs');
  });
});
