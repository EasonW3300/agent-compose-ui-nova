import { ProviderKeysScreen } from './ProviderKeysScreen';
import { GlobalEnvSection } from './GlobalEnvSection';
import { GatewaySection } from './GatewaySection';
import { SchedulerSection } from './SchedulerSection';
import './console.css';

export function SettingsScreen() {
  return (
    <section className="console-page">
      <div className="console-page__head"><h2>设置</h2></div>
      <div className="set-block">
        <div className="run-section__head"><h3>AI 引擎密钥</h3></div>
        <ProviderKeysScreen />
      </div>
      <GlobalEnvSection />
      <GatewaySection />
      <SchedulerSection />
    </section>
  );
}
