import { describe, it, expect } from 'vitest';
import { isEditableTarget } from '../../lib/keyboard';

describe('isEditableTarget', () => {
  it('is true for input and textarea', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
  });

  it('is true for contenteditable elements', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom doesn't reflect isContentEditable from the attribute, so assert directly.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isEditableTarget(div)).toBe(true);
  });

  it('is false for non-editable elements and null', () => {
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
