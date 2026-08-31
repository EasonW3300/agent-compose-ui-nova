import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithClient } from '../test/renderWithClient';
import { SettingsScreen } from './SettingsScreen';

vi.mock('./ProviderKeysScreen', () => ({ ProviderKeysScreen: () => <div>provider keys</div> }));
vi.mock('./GlobalEnvSection', () => ({ GlobalEnvSection: () => <div>global env</div> }));
vi.mock('./GatewaySection', () => ({ GatewaySection: () => <div>gateway</div> }));
vi.mock('./SchedulerSection', () => ({ SchedulerSection: () => <div>scheduler</div> }));
describe('SettingsScreen', () => {
  it('渲染四个设置区块', () => {
    renderWithClient(<SettingsScreen />);
    expect(screen.getByText('provider keys')).toBeInTheDocument();
    expect(screen.getByText('global env')).toBeInTheDocument();
    expect(screen.getByText('gateway')).toBeInTheDocument();
    expect(screen.getByText('scheduler')).toBeInTheDocument();
  });
});
