import { useState, useEffect } from 'react';
import { uid, todayStr, getApiKey, callAI, parseJSONFromAI } from './utils';

// ── Exercise autocomplete list ────────────────────────────

const EXERCISES = [
  'Bench Press','Incline Bench Press','Decline Bench Press',
  'Squat','Front Squat','Hack Squat','Goblet Squat',
  'Deadlift','Romanian Deadlift','Sumo Deadlift',
  'Overhead Press','Push Press','Lateral Raises','Face Pulls',
  'Pull-ups','Chin-ups','Lat Pulldown','Cable Row','Barbell Row',
  'Bicep Curl','Hammer Curl','Preacher Curl',
  'Tricep Pushdown','Skull Crushers','Tricep Dips',
  'Leg Press','Leg Curl','Leg Extension','Calf Raises',
  'Hip Thrust','Glute Bridge','Bulgarian Split Squat',
];

// ── Split detection ───────────────────────────────────────

const SPLITS = ['Chest / Back', 'Shoulders / Arms', 'Legs'];

const SPLIT_KEYS = {
  'Chest / Back':     ['bench', 'chest', 'fly', 'incline', 'decline', 'pulldown', 'pull-up', 'pull up', 'chin', 'row', 'deadlift', 'lat pull'],
  'Shoulders / Arms': ['overhead', 'shoulder press', 'lateral', 'curl', 'tricep', 'face pull', 'shrug', 'pushdown', 'skull', 'hammer'],
  'Legs':             ['squat', 'leg press', 'leg curl', 'leg extension', 'hip thrust', 'glute', 'lunge', 'calf', 'romanian', 'rdl', 'bulgarian'],
};

function detectSplit(workout) {
  const text = workout.exercises.map(e => e.name.toLowerCase()).join(' ');
  let best = null, bestN = 0;
  Object.entries(SPLIT_KEYS).forEach(([split, keys]) => {
    const n = keys.filter(k => text.includes(k)).length;
    if (n > bestN) { bestN = n; best = split; }
  });
  return best;
}

function suggestNextSplit(workouts) {
  for (const w of workouts) {
    const s = detectSplit(w);
    if (s) return SPLITS[(SPLITS.indexOf(s) + 1) % SPLITS.length];
  }
  return SPLITS[0];
}

// ── Blank helpers ─────────────────────────────────────────

const blankSet = () => ({ id: uid(), reps: '', weight: '' });
const blankExercise = (name = '') => ({ id: uid(), name, sets: [blankSet()] });

// ── Component ─────────────────────────────────────────────

export default function TrainTab() {
  const [exercises, setExercises]   = useState([blankExercise()]);
  const [newName, setNewName]       = useState('');
  const [saved, setSaved]           = useState(false);
  const [selectedSplit, setSelectedSplit] = useState(SPLITS[0]);
  const [loadingPlan, setLoadingPlan]     = useState(false);
  const [plan, setPlan]                   = useState(null);
  const [planError, setPlanError]         = useState('');

  useEffect(() => {
    const workouts = JSON.parse(localStorage.getItem('gainz_workouts') || '[]');
    const today = workouts.find(w => w.date === todayStr());
    if (today?.exercises?.length) setExercises(today.exercises);
    setSelectedSplit(suggestNextSplit(workouts));
  }, []);

  // ── Exercise state helpers
  const setEx = fn => setExercises(prev => fn(prev));
  const removeExercise = id    => setEx(prev => prev.filter(e => e.id !== id));
  const updateExName   = (id, name) => setEx(prev => prev.map(e => e.id === id ? { ...e, name } : e));
  const addSet         = id    => setEx(prev => prev.map(e => e.id === id ? { ...e, sets: [...e.sets, blankSet()] } : e));
  const removeSet      = (eid, sid) => setEx(prev => prev.map(e => e.id === eid ? { ...e, sets: e.sets.filter(s => s.id !== sid) } : e));
  const updateSet      = (eid, sid, field, val) => setEx(prev =>
    prev.map(e => e.id === eid ? { ...e, sets: e.sets.map(s => s.id === sid ? { ...s, [field]: val } : s) } : e)
  );
  const addExercise = () => {
    if (!newName.trim()) return;
    setEx(prev => [...prev, blankExercise(newName.trim())]);
    setNewName('');
  };

  // ── Save workout
  const saveWorkout = () => {
    const valid = exercises.filter(e => e.name.trim() && e.sets.some(s => s.reps && s.weight));
    if (!valid.length) return;
    const workout = { id: uid(), date: todayStr(), exercises: valid };
    const existing = JSON.parse(localStorage.getItem('gainz_workouts') || '[]');
    localStorage.setItem('gainz_workouts', JSON.stringify([workout, ...existing.filter(w => w.date !== todayStr())]));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // ── AI workout plan
  const getWorkoutPlan = async () => {
    const apiKey = getApiKey();
    if (!apiKey) { setPlanError('Add your API key in Profile settings.'); return; }
    setLoadingPlan(true); setPlan(null); setPlanError('');

    const workouts = JSON.parse(localStorage.getItem('gainz_workouts') || '[]');
    const lastForSplit = workouts.find(w => detectSplit(w) === selectedSplit);

    const system = `You are a strength coach. Return ONLY a valid JSON object — no markdown, no explanation — in exactly this structure:
{
  "exercises": [
    {
      "name": "Exercise Name",
      "warmup": { "sets": 1, "reps": 10, "weight": 95 },
      "working": { "sets": 4, "reps": 8, "weight": 185 }
    }
  ],
  "note": "One sentence coaching note."
}`;

    const user = `Generate a ${selectedSplit} workout.
${lastForSplit
  ? `Last ${selectedSplit} session (apply progressive overload):\n${JSON.stringify(lastForSplit, null, 2)}`
  : `No previous ${selectedSplit} session found — use moderate, beginner-friendly weights.`}
Include 3 exercises appropriate for ${selectedSplit} with warmup and working sets.`;

    try {
      const raw = await callAI(apiKey, system, user, 1024);
      const parsed = parseJSONFromAI(raw);
      setPlan(parsed);
    } catch (e) {
      setPlanError(e.message);
    } finally {
      setLoadingPlan(false);
    }
  };

  const loadPlan = () => {
    if (!plan?.exercises) return;
    const newExercises = plan.exercises.map(ex => ({
      id: uid(),
      name: ex.name,
      sets: [
        { id: uid(), reps: String(ex.warmup?.reps ?? 10), weight: String(ex.warmup?.weight ?? '') },
        ...Array.from({ length: ex.working?.sets ?? 3 }, () => ({
          id: uid(),
          reps: String(ex.working?.reps ?? 8),
          weight: String(ex.working?.weight ?? ''),
        })),
      ],
    }));
    setExercises(newExercises);
    setPlan(null);
  };

  const totalVolume = exercises.reduce((t, e) =>
    t + e.sets.reduce((s, set) => s + (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0), 0), 0
  );

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="tab-pane">
      <datalist id="ex-list">{EXERCISES.map(e => <option key={e} value={e} />)}</datalist>

      <div className="section-header">
        <h2>Today's Session</h2>
        <span className="date-badge">{dateLabel}</span>
      </div>

      {/* AI Split suggestion */}
      <div className="card">
        <h3>Today's Split</h3>
        <div className="split-btns">
          {SPLITS.map(s => (
            <button
              key={s}
              className={`split-btn${selectedSplit === s ? ' active' : ''}`}
              onClick={() => setSelectedSplit(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <button className="btn-secondary" onClick={getWorkoutPlan} disabled={loadingPlan}>
          {loadingPlan ? 'Building plan...' : 'Get AI Workout Plan'}
        </button>
        {planError && <div className="error-box">{planError}</div>}
      </div>

      {/* AI Plan result */}
      {plan && (
        <div className="card plan-card">
          <div className="plan-hd">
            <span className="plan-split-label">{selectedSplit} Plan</span>
            <div className="plan-actions">
              <button className="btn-primary" onClick={loadPlan}>Load into Session</button>
              <button className="btn-ghost" onClick={() => setPlan(null)}>Dismiss</button>
            </div>
          </div>
          {plan.exercises?.map((ex, i) => (
            <div key={i} className="plan-exercise">
              <span className="plan-ex-name">{ex.name}</span>
              <div className="plan-sets-info">
                <span className="plan-warmup">
                  Warmup — {ex.warmup?.sets ?? 1}×{ex.warmup?.reps ?? 10} @ {ex.warmup?.weight ?? '?'} lbs
                </span>
                <span className="plan-working">
                  Working — {ex.working?.sets ?? 3}×{ex.working?.reps ?? 8} @ {ex.working?.weight ?? '?'} lbs
                </span>
              </div>
            </div>
          ))}
          {plan.note && <p className="plan-note">{plan.note}</p>}
        </div>
      )}

      {/* Exercise logger */}
      {exercises.map(ex => (
        <div key={ex.id} className="exercise-card">
          <div className="exercise-header">
            <input
              list="ex-list"
              className="ex-name-input"
              placeholder="Exercise name..."
              value={ex.name}
              onChange={e => updateExName(ex.id, e.target.value)}
            />
            <button className="icon-btn danger" onClick={() => removeExercise(ex.id)}>×</button>
          </div>

          <div className="sets-table">
            <div className="sets-row header-row">
              <span>SET</span><span>WEIGHT (lbs)</span><span>REPS</span><span />
            </div>
            {ex.sets.map((set, i) => (
              <div key={set.id} className="sets-row">
                <span className="set-num">{i + 1}</span>
                <input type="number" step="any" className="set-input" placeholder="0"
                  value={set.weight} onChange={e => updateSet(ex.id, set.id, 'weight', e.target.value)} />
                <input type="number" className="set-input" placeholder="0"
                  value={set.reps} onChange={e => updateSet(ex.id, set.id, 'reps', e.target.value)} />
                <button className="icon-btn" onClick={() => removeSet(ex.id, set.id)}>×</button>
              </div>
            ))}
          </div>
          <button className="add-set-btn" onClick={() => addSet(ex.id)}>+ Add Set</button>
        </div>
      ))}

      <div className="add-ex-row">
        <input list="ex-list" className="add-ex-input" placeholder="Add exercise..."
          value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addExercise()} />
        <button className="btn-secondary" onClick={addExercise}>Add</button>
      </div>

      {totalVolume > 0 && (
        <div className="volume-chip">
          Total Volume: <strong>{totalVolume.toLocaleString()} lbs</strong>
        </div>
      )}

      <button className={`btn-primary save-btn${saved ? ' saved' : ''}`} onClick={saveWorkout}>
        {saved ? 'Saved!' : 'Save Workout'}
      </button>
    </div>
  );
}
