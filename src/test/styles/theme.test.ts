import { readFileSync } from 'fs';
import { resolve } from 'path';

const themePath = resolve(__dirname, '../../styles/theme.css');
const globalPath = resolve(__dirname, '../../styles/global.css');

test('theme.css defines all Catppuccin Macchiato variables with correct hex values', () => {
  const css = readFileSync(themePath, 'utf8');
  const expected: Record<string, string> = {
    '--bg':       '#24273a',
    '--mantle':   '#1e2030',
    '--crust':    '#181926',
    '--mauve':    '#c6a0f6',
    '--blue':     '#8aadf4',
    '--green':    '#a6da95',
    '--red':      '#ed8796',
    '--yellow':   '#eed49f',
    '--teal':     '#8bd5ca',
    '--text':     '#cad3f5',
    '--subtext1': '#b8c0e0',
    '--overlay0': '#6e738d',
    '--surface0': '#363a4f',
    '--surface1': '#494d64',
    '--surface2': '#5b6078',
  };
  for (const [name, hex] of Object.entries(expected)) {
    expect(css, `${name} should be ${hex}`).toMatch(
      new RegExp(`${name}:\\s*${hex}`, 'i')
    );
  }
});

test('global.css defines button and input base styles', () => {
  const css = readFileSync(globalPath, 'utf8');
  expect(css).toContain('button');
  expect(css).toContain('input');
  expect(css).toContain('.badge');
  expect(css).toContain('.badge.active');
});
