import { useState } from 'react';
import { getProfile, saveProfile, getApiKey } from './utils';

const PHASES = ['cut', 'maintain', 'refeed', 'bulk'];
const MACRO_FIELDS = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein',  label: 'Protein',  unit: 'g' },
  { key: 'carbs',    label: 'Carbs',    unit: 'g' },
  { key: 'fat',      label: 'Fat',      unit: 'g' },
];

export default function ProfileModal({ onClose }) {
  const [profile, setProfile] = useState(getProfile());
  const [apiKey, setApiKey]   = useState(getApiKey());

  const upd = (field, value) => setProfile(p => ({ ...p, [field]: value }));
  const updTargets = (type, field, value) =>
    setProfile(p => ({ ...p, [type]: { ...p[type], [field]: parseFloat(value) || 0 } }));

  const save = () => {
    saveProfile(profile);
    localStorage.setItem('gainz_api_key', apiKey.trim());
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>

        <div className="modal-hd">
          <h2>Profile &amp; Settings</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-bd">

          <div className="prof-section">
            <h3>Personal</h3>

            <div className="prof-field">
              <label>Current Weight</label>
              <div className="unit-row">
                <input type="number" step="0.1" value={profile.currentWeight}
                  onChange={e => upd('currentWeight', parseFloat(e.target.value) || 0)} />
                <span>lbs</span>
              </div>
            </div>

            <div className="prof-field">
              <label>Phase</label>
              <select value={profile.phase} onChange={e => upd('phase', e.target.value)}>
                {PHASES.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="prof-field">
              <label>Weekly Goal</label>
              <div className="range-row">
                <input type="number" step="0.05" min="0" value={profile.goalMin}
                  onChange={e => upd('goalMin', parseFloat(e.target.value))} />
                <span>to</span>
                <input type="number" step="0.05" min="0" value={profile.goalMax}
                  onChange={e => upd('goalMax', parseFloat(e.target.value))} />
                <span className="range-unit">lbs / week</span>
              </div>
            </div>
          </div>

          <div className="prof-section">
            <h3>Training Day Targets</h3>
            {MACRO_FIELDS.map(({ key, label, unit }) => (
              <div key={key} className="prof-field">
                <label>{label}</label>
                <div className="unit-row">
                  <input type="number" value={profile.trainingTargets[key]}
                    onChange={e => updTargets('trainingTargets', key, e.target.value)} />
                  <span>{unit}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="prof-section">
            <h3>Rest Day Targets</h3>
            {MACRO_FIELDS.map(({ key, label, unit }) => (
              <div key={key} className="prof-field">
                <label>{label}</label>
                <div className="unit-row">
                  <input type="number" value={profile.restTargets[key]}
                    onChange={e => updTargets('restTargets', key, e.target.value)} />
                  <span>{unit}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="prof-section">
            <h3>Anthropic API Key</h3>
            <input
              type="password"
              className="text-input full-width"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <p className="modal-helper">
              Used for AI food estimation, workout planning, and coaching. Stored locally only — never sent anywhere else.
            </p>
          </div>

        </div>

        <div className="modal-ft">
          <button className="btn-primary" style={{ width: '100%' }} onClick={save}>
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
}
