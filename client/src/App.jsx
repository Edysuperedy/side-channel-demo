import { useState } from 'react';
import TimingAttack from './pages/TimingAttack';
import './App.css';

function Placeholder({ name }) {
  return (
    <div style={{ padding: 24 }}>
      <h2>{name}</h2>
      <p style={{ color: '#888' }}>Coming in a later step.</p>
    </div>
  );
}

const TABS = [
  { id: 'timing', label: 'Live timing attack', render: () => <TimingAttack /> },
  { id: 'sim',    label: 'Simulated traces (CPA)', render: () => <Placeholder name="Simulated power traces" /> },
  { id: 'real',   label: 'Real traces (ASCAD)', render: () => <Placeholder name="Real ASCAD traces" /> },
];

export default function App() {
  const [tab, setTab] = useState('timing');
  const active = TABS.find(t => t.id === tab);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ padding: '16px 24px', borderBottom: '1px solid #ddd' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Side-channel demo</h1>
      </header>
      <nav style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: tab === t.id ? '#fff' : '#f5f5f5',
              borderBottom: tab === t.id ? '2px solid #333' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: tab === t.id ? 600 : 400,
              fontSize: 14,
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {active.render()}
    </div>
  );
}