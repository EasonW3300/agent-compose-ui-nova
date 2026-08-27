import { BrowserRouter } from 'react-router-dom';
import { useDaemonProbe } from './hooks/useDaemonProbe';
import { SetupShell } from './ui/SetupShell';
import { ConsoleLayout } from './ui/ConsoleLayout';

export default function App() {
  const { state } = useDaemonProbe();

  if (state === 'probing') {
    return <div role="status">正在寻找你电脑上的 agent-compose…</div>;
  }

  return (
    <BrowserRouter>
      {state === 'offline' ? <SetupShell /> : <ConsoleLayout />}
    </BrowserRouter>
  );
}
