import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App 冒烟', () => {
  it('渲染应用标题', () => {
    render(<App />);
    expect(screen.getByText('Agent Compose 驾驶台')).toBeInTheDocument();
  });
});
