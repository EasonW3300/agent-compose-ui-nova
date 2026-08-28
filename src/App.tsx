import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useDaemonProbe } from './hooks/useDaemonProbe';
import { queryClient } from './lib/queryClient';
import { SetupShell } from './ui/SetupShell';
import { ConsoleLayout } from './ui/ConsoleLayout';
import { AgentListScreen } from './ui/AgentListScreen';
import { CreateWizard } from './ui/CreateWizard';
import { DashboardScreen } from './ui/DashboardScreen';
import { RunsScreen } from './ui/RunsScreen';
import { RunDetailScreen } from './ui/RunDetailScreen';
import { PagePlaceholder } from './ui/placeholders';

export default function App() {
  const { state } = useDaemonProbe();

  if (state === 'probing') {
    return <div role="status">正在寻找你电脑上的 agent-compose…</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {state === 'offline' ? (
          <SetupShell />
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/console" replace />} />
            <Route path="/console" element={<ConsoleLayout />}>
              <Route index element={<DashboardScreen />} />
              <Route path="agents" element={<AgentListScreen />} />
              <Route path="agents/new" element={<CreateWizard />} />
              <Route path="agents/:agentName/edit" element={<CreateWizard />} />
              <Route path="runs" element={<RunsScreen />} />
              <Route path="runs/:runId" element={<RunDetailScreen />} />
              <Route path="resources" element={<PagePlaceholder title="资源中心" note="工作区/数据文件夹/插件/沙箱在这里（下个阶段）" />} />
              <Route path="settings" element={<PagePlaceholder title="设置（下个阶段）" note="密钥、全局环境变量与进阶配置在这里" />} />
              <Route path="*" element={<Navigate to="/console" replace />} />
            </Route>
          </Routes>
        )}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
