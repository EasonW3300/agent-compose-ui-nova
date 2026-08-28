import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompletionScreen } from './CompletionScreen';

describe('CompletionScreen', () => {
  it('展示庆祝文案与自动进入提示', () => {
    render(<CompletionScreen />);
    expect(screen.getByRole('heading', { name: '搞定了！' })).toBeInTheDocument();
    expect(screen.getByText(/进入主控台/)).toBeInTheDocument();
  });
});
