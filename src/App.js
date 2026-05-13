import { useState } from 'react';
import './App.css';
import TrainTab from './TrainTab';
import FuelTab from './FuelTab';
import BodyTab from './BodyTab';
import GainsTab from './GainsTab';
import ProfileModal from './ProfileModal';

const TABS = ['Train', 'Fuel', 'Body', 'Gains'];

export default function App() {
  const [tab, setTab]               = useState('Train');
  const [showProfile, setShowProfile] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo-chip">GZ</span>
        <h1 className="app-title">GAINZ TRACKER</h1>
        <button className="btn-profile" onClick={() => setShowProfile(true)}>Profile</button>
      </header>

      <nav className="tab-bar">
        {TABS.map(t => (
          <button
            key={t}
            className={`tab-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        {tab === 'Train' && <TrainTab />}
        {tab === 'Fuel'  && <FuelTab />}
        {tab === 'Body'  && <BodyTab />}
        {tab === 'Gains' && <GainsTab />}
      </main>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
