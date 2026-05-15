// v2.1
import { useState, useEffect, useRef } from 'react';
import { uid, todayStr, getProfile, getApiKey, callAI, streamAI, streamAIMessages, parseJSONFromAI } from './utils';

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

function renderBuilderText(text) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} className="builder-spacer" />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      /^\*\*[^*]+\*\*$/.test(part) ? <strong key={j}>{part.slice(2, -2)}</strong> : part
    );
    return <p key={i}>{parts}</p>;
  });
}

function computeHistory(profile) {
  const nutrition = JSON.parse(localStorage.getItem('gainz_nutrition') || '{}');
  return Object.entries(nutrition)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)
    .map(([date, entry]) => {
      const meals = Array.isArray(entry) ? entry : (entry.meals || []);
      const isTraining = !Array.isArray(entry) && (entry.isTraining ?? false);
      const targets = isTraining ? profile.trainingTargets : profile.restTargets;
      const totals = meals.reduce(
        (acc, m) => ({
          calories: acc.calories + (parseFloat(m.calories) || 0),
          protein:  acc.protein  + (parseFloat(m.protein)  || 0),
          carbs:    acc.carbs    + (parseFloat(m.carbs)    || 0),
          fat:      acc.fat      + (parseFloat(m.fat)      || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
      return { date, totals, targets };
    });
}

const ESTIMATION_SYSTEM = `You are a precise nutritionist. Return ONLY a valid JSON object with these exact fields: name (string), quantity (string, e.g. "240g" or "2 bars" or "1 cup"), protein (number, grams), carbs (number, grams), fat (number, grams), calories (number). No markdown, no explanation, just the JSON.

Use these accurate cooked/prepared values per 100g unless the user specifies otherwise:
- Cooked chicken breast: 31g protein, 0g carbs, 3.6g fat, 165 kcal
- Cooked ground beef (90% lean): 26g protein, 0g carbs, 10g fat, 196 kcal
- Cooked white rice: 2.7g protein, 28g carbs, 0.3g fat, 130 kcal
- Cooked brown rice: 2.6g protein, 23g carbs, 0.9g fat, 112 kcal
- Cooked oats (oatmeal): 2.5g protein, 12g carbs, 1.5g fat, 71 kcal
- Whole egg (large, ~50g): 6g protein, 0.4g carbs, 5g fat, 70 kcal
- Egg whites (large): 3.6g protein, 0.2g carbs, 0g fat, 17 kcal
- Whole milk (240ml): 8g protein, 12g carbs, 8g fat, 150 kcal
- Greek yogurt plain (100g): 10g protein, 4g carbs, 0.5g fat, 59 kcal
- Cottage cheese (100g): 11g protein, 3g carbs, 4g fat, 90 kcal
- Salmon (cooked, 100g): 25g protein, 0g carbs, 13g fat, 208 kcal
- Tuna canned in water (100g): 26g protein, 0g carbs, 1g fat, 116 kcal
- Broccoli cooked (100g): 2.8g protein, 7g carbs, 0.3g fat, 35 kcal
- Sweet potato cooked (100g): 2g protein, 20g carbs, 0.1g fat, 90 kcal
- Banana (medium, ~120g): 1.3g protein, 27g carbs, 0.4g fat, 105 kcal
- Almonds (100g): 21g protein, 22g carbs, 50g fat, 579 kcal
- Peanut butter (100g): 25g protein, 20g carbs, 50g fat, 598 kcal
- Olive oil (100g): 0g protein, 0g carbs, 100g fat, 884 kcal
- Bread white (1 slice ~30g): 2.7g protein, 14g carbs, 1g fat, 79 kcal

For branded products (e.g. "Oikos Triple Zero", "Nature Valley bar", "Fairlife milk", "Quest bar", "Premier Protein shake"), use the official nutrition label values for that specific product. Scale all values to the exact quantity the user described.`;

function builderSystem(remaining) {
  return `You are a nutrition coach helping the user plan a meal around their remaining daily macro targets.

Remaining macros for today:
Calories: ${Math.round(remaining.calories)} kcal, Protein: ${Math.round(remaining.protein)}g, Carbs: ${Math.round(remaining.carbs)}g, Fat: ${Math.round(remaining.fat)}g

Before suggesting a meal, ask what type it is if the user hasn't said: breakfast, pre-workout, post-workout, work meal, or snack. Then size it for that type — do not try to fill all remaining macros at once:

Pre-workout: small, 15-20% of remaining calories. Fast-digesting carbs like fruit, bread, honey, or rice cakes. Keep fat very low so digestion is fast.
Post-workout: 25-35% of remaining calories. Prioritize protein and carbs together — chicken and rice, Greek yogurt with fruit, etc.
Breakfast: 25-30% of remaining calories, balanced across macros.
Work meal or lunch: 30-40% of remaining calories, bigger and complete.
Snack: small, 10-15% of remaining calories.

Always give exact gram amounts for each ingredient. Show the macro totals for the meal you suggest and note what will remain after eating it.

Write in plain conversational text. No markdown headers (##), bullet dashes (-), or tables. You may bold (**like this**) food names and key numbers. Keep it short — 4-6 sentences max per response.`;
}

export default function FuelTab() {
  const profile = getProfile();

  const [meals, setMeals]                 = useState([]);
  const [activeDayDate, setActiveDayDate] = useState(todayStr);
  const [isTraining, setIsTraining]       = useState(isTodayTrainingDay);
  const [form, setForm]                   = useState(blankForm());
  const [showManual, setShowManual]       = useState(false);
  const [foodInput, setFoodInput]         = useState('');
  const [estimating, setEstimating]       = useState(false);
  const [rec, setRec]                     = useState('');
  const [recLoading, setRecLoading]       = useState(false);
  const [error, setError]                 = useState('');
  const [historyData, setHistoryData]     = useState([]);

  const [builderInput, setBuilderInput]       = useState('');
  const [builderLoading, setBuilderLoading]   = useState(false);
  const [logMealLoading, setLogMealLoading]   = useState(false);
  const builderEndRef = useRef(null);

  // Persisted across sessions — lazy init from localStorage
  const [builderChat, setBuilderChat] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gainz_builder_chat') || '[]'); }
    catch { return []; }
  });

  const goals = isTraining ? profile.trainingTargets : profile.restTargets;

  useEffect(() => {
    const active = JSON.parse(localStorage.getItem('gainz_active_day') || 'null');
    if (active) {
      setMeals(active.meals || []);
      setIsTraining(active.isTraining ?? isTodayTrainingDay());
      setActiveDayDate(active.date || todayStr());
    } else {
      const today = todayStr();
      const nutrition = JSON.parse(localStorage.getItem('gainz_nutrition') || '{}');
      const todayMeals = nutrition[today] || [];
      const savedType = JSON.parse(localStorage.getItem('gainz_day_type') || 'null');
      const isTrainingDay = savedType?.date === today ? savedType.isTraining : isTodayTrainingDay();
      setMeals(todayMeals);
      setIsTraining(isTrainingDay);
      setActiveDayDate(today);
      localStorage.setItem('gainz_active_day', JSON.stringify({ date: today, meals: todayMeals, isTraining: isTrainingDay }));
    }
    setHistoryData(computeHistory(getProfile()));
  }, []);

  // Save chat to localStorage + auto-scroll on every chat update
  useEffect(() => {
    localStorage.setItem('gainz_builder_chat', JSON.stringify(builderChat));
    builderEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [builderChat]);

  const selectDayType = (training) => {
    setIsTraining(training);
    const active = JSON.parse(localStorage.getItem('gainz_active_day') || '{}');
    active.isTraining = training;
    localStorage.setItem('gainz_active_day', JSON.stringify(active));
  };

  const persistMeals = updated => {
    const active = JSON.parse(localStorage.getItem('gainz_active_day') || `{"date":"${todayStr()}","isTraining":false}`);
    active.meals = updated;
    localStorage.setItem('gainz_active_day', JSON.stringify(active));
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
      const raw = await callAI(apiKey, ESTIMATION_SYSTEM, input, 400);
      const parsed = parseJSONFromAI(raw);
      const freshActive = JSON.parse(localStorage.getItem('gainz_active_day') || '{}');
      const freshMeals = freshActive.meals || [];
      persistMeals([...freshMeals, { id: uid(), ...parsed }]);
      setFoodInput('');
    } catch (e) {
      setError('Could not estimate: ' + e.message);
    } finally {
      setEstimating(false);
    }
  };

  const startNewDay = () => {
    if (!window.confirm("Save today's log to history and start a fresh day?")) return;
    const active = JSON.parse(localStorage.getItem('gainz_active_day') || '{}');
    if (active.meals?.length > 0) {
      const nutrition = JSON.parse(localStorage.getItem('gainz_nutrition') || '{}');
      nutrition[active.date] = { meals: active.meals, isTraining: !!active.isTraining };
      localStorage.setItem('gainz_nutrition', JSON.stringify(nutrition));
    }
    const today = todayStr();
    const isTrainingDay = isTodayTrainingDay();
    localStorage.setItem('gainz_active_day', JSON.stringify({ date: today, meals: [], isTraining: isTrainingDay }));
    setMeals([]);
    setIsTraining(isTrainingDay);
    setActiveDayDate(today);
    setRec('');
    setBuilderChat([]);
    localStorage.removeItem('gainz_builder_chat');
    setHistoryData(computeHistory(getProfile()));
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

  const sendBuilderMessage = async () => {
    const input = builderInput.trim();
    if (!input || builderLoading) return;
    const apiKey = getApiKey();
    if (!apiKey) { setError('Add your API key in Profile settings.'); return; }

    const userMsg = { role: 'user', content: input };
    const apiMessages = [...builderChat, userMsg];
    setBuilderChat(apiMessages);
    setBuilderInput('');
    setBuilderLoading(true);

    try {
      let started = false;
      await streamAIMessages(
        apiKey,
        builderSystem(remaining),
        apiMessages,
        text => {
          if (!started) {
            started = true;
            setBuilderChat(prev => [...prev, { role: 'assistant', content: text }]);
          } else {
            setBuilderChat(prev => [
              ...prev.slice(0, -1),
              { role: 'assistant', content: text },
            ]);
          }
        },
        800,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBuilderLoading(false);
    }
  };

  const logBuilderMeal = async () => {
    const lastAssistant = [...builderChat].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;
    const apiKey = getApiKey();
    if (!apiKey) { setError('Add your API key in Profile settings.'); return; }
    setLogMealLoading(true); setError('');
    try {
      const raw = await callAI(
        apiKey,
        'Extract the meal information from the nutrition coach response below. Return ONLY valid JSON with these fields: name (string, short meal name), protein (number, grams), carbs (number, grams), fat (number, grams), calories (number). Sum all ingredients into totals. No markdown, just the JSON.',
        lastAssistant.content,
        200,
      );
      const parsed = parseJSONFromAI(raw);
      const freshActive = JSON.parse(localStorage.getItem('gainz_active_day') || '{}');
      persistMeals([...(freshActive.meals || []), { id: uid(), ...parsed }]);
    } catch (e) {
      setError('Could not log meal: ' + e.message);
    } finally {
      setLogMealLoading(false);
    }
  };

  const clearBuilderChat = () => {
    setBuilderChat([]);
    localStorage.removeItem('gainz_builder_chat');
  };

  const lastMsgIsAssistant = !builderLoading && builderChat.length > 0 &&
    builderChat[builderChat.length - 1]?.role === 'assistant';

  const autoCalPreview = macrosCal(form);
  const dateLabel = new Date(activeDayDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="tab-pane">

      {/* Header */}
      <div className="section-header">
        <h2>Daily Fuel</h2>
        <div className="fuel-header-right">
          <span className="date-badge">{dateLabel}</span>
          <button className="btn-new-day" onClick={startNewDay}>Start New Day</button>
        </div>
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
                <span className="meal-name">{m.name}{m.quantity ? ` — ${m.quantity}` : ''}</span>
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

      {/* Meal Builder */}
      <div className="card">
        <h3>Meal Builder</h3>
        <p className="field-hint">
          Tell me what you have or what you're craving — I'll build a meal sized for the moment.
        </p>

        {builderChat.length > 0 && (
          <div className="builder-chat">
            {builderChat.map((msg, i) => (
              <div key={i} className={`builder-msg builder-msg--${msg.role}`}>
                {msg.role === 'assistant'
                  ? renderBuilderText(msg.content)
                  : msg.content}
              </div>
            ))}
            {builderLoading && builderChat[builderChat.length - 1]?.role === 'user' && (
              <div className="builder-msg builder-msg--assistant builder-msg--loading">
                Thinking...
              </div>
            )}
            <div ref={builderEndRef} />
          </div>
        )}

        {lastMsgIsAssistant && (
          <button className="btn-log-meal" onClick={logBuilderMeal} disabled={logMealLoading}>
            {logMealLoading ? 'Adding to log...' : '+ Log this meal'}
          </button>
        )}

        <div className="builder-input-row">
          <input
            className="ai-food-input"
            placeholder='e.g. "I have chicken and rice" or "something quick pre-workout"'
            value={builderInput}
            onChange={e => setBuilderInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendBuilderMessage()}
            disabled={builderLoading}
          />
          <button
            className="btn-primary"
            onClick={sendBuilderMessage}
            disabled={builderLoading || !builderInput.trim()}
          >
            {builderLoading ? '...' : 'Send'}
          </button>
        </div>

        {builderChat.length > 0 && (
          <button className="btn-ghost" style={{ marginTop: 6 }} onClick={clearBuilderChat}>
            Clear chat
          </button>
        )}
      </div>

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

      {/* Macro History */}
      <div className="section-header" style={{ marginTop: 8 }}>
        <h2>History</h2>
      </div>
      {historyData.length === 0 ? (
        <p className="empty-state" style={{ padding: '16px 0 32px' }}>
          No history yet. Finish a day and tap "Start New Day" to save it.
        </p>
      ) : (
        <div className="card">
          <h3>Last 7 Days</h3>
          <div className="macro-history-list">
            {historyData.map(({ date, totals, targets }) => {
              const hitCal = totals.calories >= targets.calories * 0.9;
              const hitPro = totals.protein  >= targets.protein  * 0.9;
              const hitCrb = totals.carbs    >= targets.carbs    * 0.9;
              const hitFat = totals.fat      >= targets.fat      * 0.9;
              return (
                <div key={date} className="macro-hist-row">
                  <span className="macro-hist-date">
                    {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <div className="macro-hist-macros">
                    <span className={`macro-hist-val${hitCal ? ' hit' : ' miss'}`}>
                      {Math.round(totals.calories)}<span className="macro-hist-unit">kcal</span>
                    </span>
                    <span className={`macro-hist-val${hitPro ? ' hit' : ' miss'}`}>
                      {Math.round(totals.protein)}<span className="macro-hist-unit">P</span>
                    </span>
                    <span className={`macro-hist-val${hitCrb ? ' hit' : ' miss'}`}>
                      {Math.round(totals.carbs)}<span className="macro-hist-unit">C</span>
                    </span>
                    <span className={`macro-hist-val${hitFat ? ' hit' : ' miss'}`}>
                      {Math.round(totals.fat)}<span className="macro-hist-unit">F</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
