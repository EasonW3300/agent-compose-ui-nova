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
import { ResourcesScreen } from './ui/ResourcesScreen';
import { SettingsScreen } from './ui/SettingsScreen';

export default function App() {
  const { state } = useDaemonProbe();

  if (state === 'probing') {
    return <div className="acnova-app" role="status">正在寻找你电脑上的 agent-compose…</div>;
  }

  return (
    <div className="acnova-app">
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
                <Route path="resources" element={<ResourcesScreen />} />
                <Route path="settings" element={<SettingsScreen />} />
                <Route path="*" element={<Navigate to="/console" replace />} />
              </Route>
            </Routes>
          )}
        </BrowserRouter>
      </QueryClientProvider>
    </div>
  );
}
