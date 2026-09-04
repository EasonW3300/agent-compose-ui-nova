// Node's filesystem API reads the actual stylesheet so this test guards the browser-facing selector scope.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const setupCss = readFileSync('src/ui/setup.css', 'utf8');

describe('setup form control styles', () => {
  it('keeps engine radio inputs out of the full-width text-control rule', () => {
    expect(setupCss).toContain(".setup-shell input:not([type='radio'])");
    expect(setupCss).toContain(".engine-card input[type='radio']");
  });
});
