import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { useDaemonProbe } from './hooks/useDaemonProbe';
import { queryClient } from './lib/queryClient';
import { SetupShell } from './ui/SetupShell';
import { ConsoleLayout } from './ui/ConsoleLayout';

export default function App() {
  const { state } = useDaemonProbe();

  if (state === 'probing') {
    return <div role="status">正在寻找你电脑上的 agent-compose…</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {state === 'offline' ? <SetupShell /> : <ConsoleLayout />}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
