import { useState } from 'react';
import { PresetsTab } from './PresetsTab';
import { VolumesTab } from './VolumesTab';
import { PluginLibraryTab } from './PluginLibraryTab';
import { SandboxesTab } from './SandboxesTab';
import './console.css';

const TABS = [
  { id: 'presets', label: '工作区预设' },
  { id: 'volumes', label: '数据卷' },
  { id: 'plugins', label: '插件库' },
  { id: 'sandboxes', label: '沙箱与镜像' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ResourcesScreen() {
  const [tab, setTab] = useState<TabId>('presets');
  return (
    <section className="console-page">
      <div className="console-page__head"><h2>资源中心</h2></div>
      <div className="res-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`res-tab${tab === t.id ? ' res-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'presets' && <PresetsTab />}
      {tab === 'volumes' && <VolumesTab />}
      {tab === 'plugins' && <PluginLibraryTab />}
      {tab === 'sandboxes' && <SandboxesTab />}
    </section>
  );
}
