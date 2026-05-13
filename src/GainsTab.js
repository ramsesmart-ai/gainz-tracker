import { useState, useEffect } from 'react';
import { getApiKey, streamAI } from './utils';

function renderMarkdown(text) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} className="spacer" />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      /^\*\*[^*]+\*\*$/.test(part) ? <strong key={j}>{part.slice(2, -2)}</strong> : part
    );
    return <p key={i}>{parts}</p>;
  });
}

export default function GainsTab() {
  const [workouts, setWorkouts] = useState([]);
  const [coaching, setCoaching] = useState(false);
  const [response, setResponse] = useState('');
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setWorkouts(JSON.parse(localStorage.getItem('gainz_workouts') || '[]'));
  }, []);

  const prs = workouts.reduce((acc, workout) => {
    workout.exercises.forEach(ex => {
      ex.sets.forEach(s => {
        const weight = parseFloat(s.weight), reps = parseInt(s.reps);
        if (!weight || !reps) return;
        const e1rm = Math.round(weight * (1 + reps / 30));
        if (!acc[ex.name] || e1rm > acc[ex.name].e1rm) {
          acc[ex.name] = { weight, reps, e1rm, date: workout.date };
        }
      });
    });
    return acc;
  }, {});

  const persistWorkouts = updated => {
    localStorage.setItem('gainz_workouts', JSON.stringify(updated));
    setWorkouts(updated);
  };

  const deleteWorkout = id => {
    if (expanded === id) setExpanded(null);
    persistWorkouts(workouts.filter(w => w.id !== id));
  };

  const deleteExercise = (wid, eid) => {
    const updated = workouts.reduce((acc, w) => {
      if (w.id !== wid) { acc.push(w); return acc; }
      const exercises = w.exercises.filter(e => e.id !== eid);
      if (exercises.length > 0) acc.push({ ...w, exercises });
      return acc;
    }, []);
    if (!updated.find(w => w.id === wid)) setExpanded(null);
    persistWorkouts(updated);
  };

  const getCoachTips = async () => {
    const apiKey = getApiKey();
    if (!apiKey) { setError('Add your API key in Profile settings.'); return; }
    if (!workouts.length) { setError('Log some workouts first so the coach has data to analyze.'); return; }
    setCoaching(true); setResponse(''); setError('');

    try {
      await streamAI(
        apiKey,
        `You are an expert strength coach specializing in progressive overload and hypertrophy.`,
        `Analyze this workout history and give specific, actionable recommendations for each exercise logged.

For each exercise: state current working weight/reps, identify any plateau, give ONE concrete next step (add weight, add reps, add a set, variation, or deload). Keep each block to 2–3 sentences. Use **Exercise Name** as the header. After the exercises, add 1–2 brief programming notes based on the overall pattern.

Be direct, specific, and encouraging.

Workout History (most recent first, last 10 sessions):
${JSON.stringify(workouts.slice(0, 10), null, 2)}`,
        text => setResponse(text),
        1500,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setCoaching(false);
    }
  };

  const hasApiKey = !!getApiKey();

  return (
    <div className="tab-pane">

      {/* Personal Records */}
      <div className="section-header"><h2>Personal Records</h2></div>
      {Object.keys(prs).length === 0 ? (
        <p className="empty-state">No workouts logged yet. Start in the Train tab.</p>
      ) : (
        <div className="pr-grid">
          {Object.entries(prs).map(([name, { weight, reps, e1rm, date }]) => (
            <div key={name} className="pr-card">
              <span className="pr-exercise">{name}</span>
              <span className="pr-lift">{weight} × {reps}</span>
              <span className="pr-e1rm">~{e1rm} lbs 1RM</span>
              <span className="pr-date">{date}</span>
            </div>
          ))}
        </div>
      )}

      {/* Workout History */}
      <div className="section-header" style={{ marginTop: 32 }}><h2>Workout History</h2></div>
      {workouts.length === 0 ? (
        <p className="empty-state">No sessions logged yet.</p>
      ) : (
        <div className="history-list">
          {workouts.map(w => (
            <div key={w.id} className="history-card">
              <div className="history-header">
                <button className="history-toggle"
                  onClick={() => setExpanded(e => e === w.id ? null : w.id)}>
                  <span className="history-date">
                    {new Date(w.date + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                  </span>
                  <span className="history-summary">
                    {w.exercises.length} exercise{w.exercises.length !== 1 ? 's' : ''}
                  </span>
                  <span className="chevron">{expanded === w.id ? '▲' : '▼'}</span>
                </button>
                <button className="icon-btn danger" onClick={() => deleteWorkout(w.id)}>×</button>
              </div>
              {expanded === w.id && (
                <div className="history-body">
                  {w.exercises.map(ex => (
                    <div key={ex.id} className="history-ex">
                      <div className="history-ex-header">
                        <span className="history-ex-name">{ex.name}</span>
                        <button className="icon-btn danger" onClick={() => deleteExercise(w.id, ex.id)}>×</button>
                      </div>
                      <div className="set-chips">
                        {ex.sets.map((s, i) => (
                          <span key={s.id} className="set-chip">
                            {i + 1}: {s.weight}lbs × {s.reps}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI Coach */}
      <div className="section-header" style={{ marginTop: 32 }}><h2>AI Coach</h2></div>
      <div className="card coach-card">
        {!hasApiKey && (
          <p className="coach-desc" style={{ color: 'var(--text-2)' }}>
            Add your Anthropic API key in <strong>Profile</strong> to enable the AI coach.
          </p>
        )}
        {hasApiKey && (
          <p className="coach-desc">
            Analyzes your last 10 sessions and gives specific progressive overload recommendations per exercise, streamed live from Claude.
          </p>
        )}
        <button className="btn-primary" onClick={getCoachTips} disabled={coaching || !hasApiKey}>
          {coaching ? 'Analyzing...' : 'Get Coach Tips'}
        </button>
        {error && <div className="error-box">{error}</div>}
        {response && <div className="coach-response">{renderMarkdown(response)}</div>}
      </div>

    </div>
  );
}
