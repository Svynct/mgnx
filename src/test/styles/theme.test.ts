import { readFileSync } from 'fs';
import { resolve } from 'path';

test('theme.css defines all required Macchiato variables', () => {
  const css = readFileSync(resolve(__dirname, '../../styles/theme.css'), 'utf8');
  const required = [
    '--bg', '--mantle', '--crust', '--mauve', '--blue', '--green',
    '--red', '--yellow', '--teal', '--text', '--subtext1', '--overlay0',
    '--surface0', '--surface1', '--surface2',
  ];
  for (const v of required) {
    expect(css).toContain(v);
  }
});

test('global.css defines button and input base styles', () => {
  const css = readFileSync(resolve(__dirname, '../../styles/global.css'), 'utf8');
  expect(css).toContain('button');
  expect(css).toContain('input');
  expect(css).toContain('.badge');
  expect(css).toContain('.badge.active');
});
