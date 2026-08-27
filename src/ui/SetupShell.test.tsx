import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SetupShell } from './SetupShell';

describe('SetupShell', () => {
  it('展示 5 个装机步骤名', () => {
    render(<SetupShell />);
    for (const step of ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成']) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });
});
