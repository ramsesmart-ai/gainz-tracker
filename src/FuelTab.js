import { useState, useEffect } from 'react';
import { uid, todayStr, getProfile, getApiKey, callAI, streamAI, parseJSONFromAI } from './utils';

const macrosCal = ({ protein = 0, carbs = 0, fat = 0 }) =>
  (parseFloat(protein) || 0) * 4 + (parseFloat(carbs) || 0) * 4 + (parseFloat(fat) || 0) * 9;

const blankForm = () => ({ name: '', protein: '', carbs: '', fat: '', calories: '' });

const MACROS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', color: '#e4e4e7' },
  { key: 'protein',  label: 'Protein',  unit: 'g',    color: '#60a5fa' },
  { key: 'carbs',    label: 'Carbs',    unit: 'g',    color: '#a78bfa' },
  { key: 'fat',      label: 'Fat',      unit: 'g',    color: '#34d399' },
];

function isTodayTrainingDay() {
  const workouts = JSON.parse(localStorage.getItem('gainz_workouts') || '[]');
  return workouts.some(w => w.date === todayStr());
}

export default function FuelTab() {
  const profile = getProfile();

  const [meals, setMeals]           = useState([]);
  const [isTraining, setIsTraining] = useState(isTodayTrainingDay);
  const [form, setForm]             = useState(blankForm());
  const [showManual, setShowManual] = useState(false);
  const [foodInput, setFoodInput]   = useState('');
  const [estimating, setEstimating] = useState(false);
  const [rec, setRec]               = useState('');
  const [recLoading, setRecLoading] = useState(false);
  const [error, setError]           = useState('');

  const goals = isTraining ? profile.trainingTargets : profile.restTargets;

  useEffect(() => {
    const nutrition = JSON.parse(localStorage.getItem('gainz_nutrition') || '{}');
    setMeals(nutrition[todayStr()] || []);

    const saved = JSON.parse(localStorage.getItem('gainz_day_type') || 'null');
    if (saved?.date === todayStr()) {
      setIsTraining(saved.isTraining);
    }
  }, []);

  const selectDayType = (training) => {
    setIsTraining(training);
    localStorage.setItem('gainz_day_type', JSON.stringify({ date: todayStr(), isTraining: training }));
  };

  const persistMeals = updated => {
    const nutrition = JSON.parse(localStorage.getItem('gainz_nutrition') || '{}');
    nutrition[todayStr()] = updated;
    localStorage.setItem('gainz_nutrition', JSON.stringify(nutrition));
    setMeals(updated);
  };

  const removeMeal = id => persistMeals(meals.filter(m => m.id !== id));

  const addManual = () => {
    if (!form.name.trim()) return;
    const calories = form.calories ? parseFloat(form.calories) : Math.round(macrosCal(form));
    persistMeals([...meals, { id: uid(), ...form, calories }]);
    setForm(blankForm());
  };

  const estimateMacros = async () => {
    const input = foodInput.trim();
    if (!input) return;
    const apiKey = getApiKey();
    if (!apiKey) { setError('Add your API key in Profile settings.'); return; }
    setEstimating(true); setError('');

    try {
      const raw = await callAI(
        apiKey,
        `You are a nutritionist. Return ONLY a valid JSON object with these exact fields: name (string), protein (number, grams), carbs (number, grams), fat (number, grams), calories (number). No markdown, no explanation, just the JSON.`,
        input,
        256,
      );
      const parsed = parseJSONFromAI(raw);
      // Read fresh from localStorage to avoid stale closure if another meal was added while awaiting
      const freshNutrition = JSON.parse(localStorage.getItem('gainz_nutrition') || '{}');
      const freshMeals = freshNutrition[todayStr()] || [];
      persistMeals([...freshMeals, { id: uid(), ...parsed }]);
      setFoodInput('');
    } catch (e) {
      setError('Could not estimate: ' + e.message);
    } finally {
      setEstimating(false);
    }
  };

  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (parseFloat(m.calories) || 0),
      protein:  acc.protein  + (parseFloat(m.protein)  || 0),
      carbs:    acc.carbs    + (parseFloat(m.carbs)    || 0),
      fat:      acc.fat      + (parseFloat(m.fat)      || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const remaining = {
    calories: Math.max(0, goals.calories - totals.calories),
    protein:  Math.max(0, goals.protein  - totals.protein),
    carbs:    Math.max(0, goals.carbs    - totals.carbs),
    fat:      Math.max(0, goals.fat      - totals.fat),
  };

  const pct = (val, goal) => goal > 0 ? Math.min(100, Math.round((val / goal) * 100)) : 0;

  const getRecommendation = async () => {
    const apiKey = getApiKey();
    if (!apiKey) { setError('Add your API key in Profile settings.'); return; }
    setRecLoading(true); setRec(''); setError('');
    try {
      await streamAI(
        apiKey,
        `You are a sports nutritionist helping an athlete hit their daily macro targets.`,
        `I'm on a ${isTraining ? 'training' : 'rest'} day and still need: ${remaining.calories} kcal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat. Suggest 2–3 specific foods or meals with portions to get me close. Be direct and practical — 3–4 sentences.`,
        text => setRec(text),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setRecLoading(false);
    }
  };

  const autoCalPreview = macrosCal(form);
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="tab-pane">

      {/* Header */}
      <div className="section-header">
        <h2>Daily Fuel</h2>
        <span className="date-badge">{dateLabel}</span>
      </div>

      {/* Day type toggle */}
      <div className="day-toggle-row">
        <div className="day-toggle">
          <button
            className={`day-btn${isTraining ? ' active' : ''}`}
            onClick={() => selectDayType(true)}
          >
            Training Day
          </button>
          <button
            className={`day-btn${!isTraining ? ' active' : ''}`}
            onClick={() => selectDayType(false)}
          >
            Rest Day
          </button>
        </div>
        <span className="targets-label">
          {goals.calories} kcal · {goals.protein}P · {goals.carbs}C · {goals.fat}F
        </span>
      </div>

      {/* Progress + remaining */}
      <div className="card">
        <h3>Progress</h3>
        {MACROS.map(({ key, label, unit, color }) => (
          <div key={key} className="macro-bar-row">
            <div className="macro-bar-label">
              <span>{label}</span>
              <span style={{ color }}>
                {Math.round(totals[key])}
                <span className="muted"> / {goals[key]}{unit}</span>
              </span>
            </div>
            <div className="macro-bar-track">
              <div className="macro-bar-fill" style={{ width: `${pct(totals[key], goals[key])}%`, background: color }} />
            </div>
          </div>
        ))}

        <div className="remaining-strip">
          {MACROS.map(({ key, unit, color }) => (
            <div key={key} className="rem-item">
              <span className="rem-amount" style={{ color }}>
                {Math.round(remaining[key])}
                <span className="rem-unit">{unit}</span>
              </span>
              <span className="rem-label">{key} left</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI food input */}
      <div className="card">
        <h3>Log with AI</h3>
        <div className="ai-food-row">
          <input
            className="ai-food-input"
            placeholder='Describe what you ate — e.g. "200g chicken breast and 150g white rice"'
            value={foodInput}
            onChange={e => setFoodInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && estimateMacros()}
          />
          <button className="btn-primary" onClick={estimateMacros} disabled={estimating || !foodInput.trim()}>
            {estimating ? '...' : 'Add'}
          </button>
        </div>
        <p className="field-hint">AI estimates macros and adds the meal to your log automatically.</p>
        {error && <div className="error-box">{error}</div>}
      </div>

      {/* Meal log */}
      {meals.length > 0 && (
        <div className="card">
          <div className="card-row-hd">
            <h3>Today's Meals</h3>
            <button className="btn-ghost" onClick={getRecommendation} disabled={recLoading}>
              {recLoading ? 'Thinking...' : 'What to eat next?'}
            </button>
          </div>
          {meals.map(m => (
            <div key={m.id} className="meal-row">
              <div>
                <span className="meal-name">{m.name}</span>
                <span className="meal-meta">
                  {[
                    m.calories && `${Math.round(m.calories)} kcal`,
                    m.protein  && `P ${m.protein}g`,
                    m.carbs    && `C ${m.carbs}g`,
                    m.fat      && `F ${m.fat}g`,
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
              <button className="icon-btn danger" onClick={() => removeMeal(m.id)}>×</button>
            </div>
          ))}
          {rec && (
            <div className="rec-response">
              <span className="rec-label">Recommendation</span>
              {rec}
            </div>
          )}
        </div>
      )}

      {/* Manual add (collapsed) */}
      <div className="card">
        <button className="collapsible-toggle" onClick={() => setShowManual(v => !v)}>
          <h3 style={{ pointerEvents: 'none' }}>Log Manually</h3>
          <span className="chevron">{showManual ? '▲' : '▼'}</span>
        </button>
        {showManual && (
          <>
            <input className="text-input" placeholder="Meal name..."
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addManual()} />
            <div className="macro-grid">
              {['protein', 'carbs', 'fat'].map(m => (
                <div key={m} className="macro-input-group">
                  <label>{m.charAt(0).toUpperCase() + m.slice(1)} (g)</label>
                  <input type="number" step="any" value={form[m]}
                    onChange={e => setForm(p => ({ ...p, [m]: e.target.value }))} />
                </div>
              ))}
              <div className="macro-input-group">
                <label>Calories</label>
                <input type="number"
                  placeholder={autoCalPreview > 0 ? `~${Math.round(autoCalPreview)}` : ''}
                  value={form.calories}
                  onChange={e => setForm(p => ({ ...p, calories: e.target.value }))} />
              </div>
            </div>
            <button className="btn-primary" onClick={addManual}>Log Meal</button>
          </>
        )}
      </div>

    </div>
  );
}
