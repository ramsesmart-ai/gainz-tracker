import { useState, useEffect, useRef } from 'react';
import { uid, todayStr, getApiKey, callAI, parseJSONFromAI } from './utils';

// ── Exercise lists per split ──────────────────────────────

const SPLIT_EXERCISES = {
  'Chest / Back': [
    'Bench Press','Incline Bench Press','Incline Smith Machine','Incline Dumbbell Press',
    'Decline Bench Press','Cable Flyes','Cable Chest Flyes','Cable Crossover','Pec Deck',
    'Chest Press Machine','Cable Pullover','Lat Pulldown','Seated Cable Row','Barbell Row',
    'T-Bar Row','Pull Ups','Face Pulls','Seated Row Machine',
  ],
  'Shoulders / Arms': [
    'Dumbbell Shoulder Press','Barbell Overhead Press','Lateral Raises','Front Raises',
    'Rear Delt Flyes','Cable Lateral Raises','Cable Front Raises','Cable Rear Delt Flyes',
    'Barbell Curl','Dumbbell Curl','Hammer Curl','Cable Curl','Cable Hammer Curl',
    'Tricep Extension','Skull Crushers','Tricep Pushdown','Overhead Tricep Extension',
    'Cable Tricep Pushdown','Cable Overhead Tricep Extension','Cable Rope Pushdown',
  ],
  'Legs': [
    'Squat','Leg Press','Romanian Deadlift','Leg Curl','Leg Extension','Walking Lunges',
    'Calf Raises','Hip Thrust','Hack Squat','Goblet Squat','Smith Machine Squat',
    'Leg Press Calf Raises','Cable Kickbacks','Cable Pull Through',
  ],
};

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
    const s = w.split || detectSplit(w);
    if (s) return SPLITS[(SPLITS.indexOf(s) + 1) % SPLITS.length];
  }
  return SPLITS[0];
}

// ── Blank helpers ─────────────────────────────────────────

const blankSet = () => ({ id: uid(), reps: '', weight: '' });
const blankExercise = (name = '') => ({ id: uid(), name, sets: [blankSet()] });

// ── Custom exercise autocomplete — works on mobile ────────

function ExerciseInput({ value, onChange, list, placeholder, className, onEnter }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = list.filter(ex =>
    !value.trim() || ex.toLowerCase().includes(value.toLowerCase())
  );

  useEffect(() => {
    const close = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div className="ex-autocomplete" ref={wrapRef}>
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter') { onEnter?.(); setOpen(false); }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="ex-dropdown">
          {filtered.map(ex => (
            <li
              key={ex}
              className="ex-option"
              onPointerDown={e => { e.preventDefault(); onChange(ex); setOpen(false); }}
            >
              {ex}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────

const DRAFT_KEY = 'gainz_draft_workout';

export default function TrainTab() {
  const [exercises, setExercises]         = useState([blankExercise()]);
  const [newName, setNewName]             = useState('');
  const [saved, setSaved]                 = useState(false);
  const [selectedSplit, setSelectedSplit] = useState(SPLITS[0]);
  const [loadingPlan, setLoadingPlan]     = useState(false);
  const [plan, setPlan]                   = useState(null);
  const [planError, setPlanError]         = useState('');
  const [draftReady, setDraftReady]       = useState(false);

  // Restore from in-progress draft or today's saved workout on mount
  useEffect(() => {
    const workouts = JSON.parse(localStorage.getItem('gainz_workouts') || '[]');
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');

    if (draft?.date === todayStr() && draft.exercises?.some(e => e.name.trim())) {
      setExercises(draft.exercises);
      setSelectedSplit(draft.selectedSplit || SPLITS[0]);
    } else {
      const today = workouts.find(w => w.date === todayStr());
      if (today?.exercises?.length) {
        setExercises(today.exercises);
        if (today.split) setSelectedSplit(today.split);
      } else {
        setSelectedSplit(suggestNextSplit(workouts));
      }
    }
    setDraftReady(true);
  }, []);

  // Auto-save draft on every change — only starts after initial load
  useEffect(() => {
    if (!draftReady) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      date: todayStr(), exercises, selectedSplit,
    }));
  }, [exercises, selectedSplit, draftReady]);

  // ── Exercise state helpers
  const setEx = fn => setExercises(prev => fn(prev));
  const removeExercise = id         => setEx(prev => prev.filter(e => e.id !== id));
  const updateExName   = (id, name) => setEx(prev => prev.map(e => e.id === id ? { ...e, name } : e));
  const addSet         = id         => setEx(prev => prev.map(e => e.id === id ? { ...e, sets: [...e.sets, blankSet()] } : e));
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
    const workout = { id: uid(), date: todayStr(), split: selectedSplit, exercises: valid };
    const existing = JSON.parse(localStorage.getItem('gainz_workouts') || '[]');
    localStorage.setItem('gainz_workouts', JSON.stringify([workout, ...existing.filter(w => w.date !== todayStr())]));
    localStorage.removeItem(DRAFT_KEY);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // ── AI workout plan
  const getWorkoutPlan = async () => {
    const apiKey = getApiKey();
    if (!apiKey) { setPlanError('Add your API key in Profile settings.'); return; }
    setLoadingPlan(true); setPlan(null); setPlanError('');

    const workouts = JSON.parse(localStorage.getItem('gainz_workouts') || '[]');
    const lastForSplit = workouts.find(w => (w.split || detectSplit(w)) === selectedSplit);

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

  const splitList = SPLIT_EXERCISES[selectedSplit] || [];
  const totalVolume = exercises.reduce((t, e) =>
    t + e.sets.reduce((s, set) => s + (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0), 0), 0
  );
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="tab-pane">
      <div className="section-header">
        <h2>Today's Session</h2>
        <span className="date-badge">{dateLabel}</span>
      </div>

      {/* Split selector */}
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
            <ExerciseInput
              className="ex-name-input"
              placeholder="Exercise name..."
              value={ex.name}
              list={splitList}
              onChange={name => updateExName(ex.id, name)}
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
        <ExerciseInput
          className="add-ex-input"
          placeholder="Add exercise..."
          value={newName}
          list={splitList}
          onChange={setNewName}
          onEnter={addExercise}
        />
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
