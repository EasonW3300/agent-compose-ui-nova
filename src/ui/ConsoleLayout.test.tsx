import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConsoleLayout } from './ConsoleLayout';
import { renderWithClient } from '../test/renderWithClient';

function renderAt(path: string) {
  return renderWithClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/:page?" element={<ConsoleLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConsoleLayout', () => {
  it('侧边导航包含五个一级页面（人话命名）', () => {
    renderAt('/console');
    for (const item of ['首页', '我的 AI 助手', '运行记录', '资源中心', '设置']) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });
  it('导航链接指向对应路径', () => {
    renderAt('/console');
    expect(screen.getByText('我的 AI 助手').closest('a')).toHaveAttribute(
      'href',
      '/console/agents',
    );
  });
});
