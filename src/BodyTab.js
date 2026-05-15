import { useState, useEffect } from 'react';
import { uid, todayStr, getProfile } from './utils';
import { pushBodyWeight, deleteSupabaseBodyWeight } from './db';

// ── Math helpers ─────────────────────────────────────────

function linReg(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const sx = pts.reduce((a, p) => a + p.x, 0);
  const sy = pts.reduce((a, p) => a + p.y, 0);
  const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
  const sx2 = pts.reduce((a, p) => a + p.x * p.x, 0);
  const d = n * sx2 - sx * sx;
  if (!d) return null;
  const slope = (n * sxy - sx * sy) / d;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function weekOf(dateStr) {
  const d = new Date((dateStr || '') + 'T12:00:00');
  if (isNaN(d.getTime())) return '1970-01-01';
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  return sun.toISOString().slice(0, 10);
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeeklyAverages(entries) {
  const map = {};
  entries.forEach(e => {
    if (!e || !e.date) return;
    const w = weekOf(e.date);
    if (!map[w]) map[w] = [];
    map[w].push(Number(e.weight));
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, ws]) => ({
      week,
      avg: parseFloat((ws.reduce((s, w) => s + w, 0) / ws.length).toFixed(2)),
      count: ws.length,
    }));
}

// ── Last 7 Days Chart ────────────────────────────────────

function Last7DaysChart({ entries }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dateStr = localDateStr(d);
    const entry = entries.find(e => e.date === dateStr);
    return {
      dateStr,
      weight: entry ? entry.weight : null,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
    };
  });

  const logged = days.filter(d => d.weight !== null);
  if (logged.length === 0) {
    return <p className="chart-empty">No weigh-ins in the last 7 days.</p>;
  }

  const W = 700, H = 180;
  const PAD = { t: 28, r: 16, b: 36, l: 52 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const weights = logged.map(d => d.weight);
  const lo = Math.min(...weights);
  const hi = Math.max(...weights);
  const spread = hi - lo || 2;
  const yLo = lo - spread * 0.5;
  const yHi = hi + spread * 0.5;

  const xAt = i => PAD.l + (i / 6) * cW;
  const yAt = w => PAD.t + (1 - (w - yLo) / (yHi - yLo)) * cH;

  // Build line segments (skip days with no data)
  const segments = [];
  let seg = [];
  days.forEach((d, i) => {
    if (d.weight !== null) {
      seg.push({ x: xAt(i), y: yAt(d.weight), weight: d.weight });
    } else if (seg.length > 0) {
      segments.push(seg);
      seg = [];
    }
  });
  if (seg.length > 0) segments.push(seg);

  const yTicks = [yLo + (yHi - yLo) * 0.15, (yLo + yHi) / 2, yHi - (yHi - yLo) * 0.15];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {yTicks.map((w, i) => (
        <g key={i}>
          <line x1={PAD.l} y1={yAt(w)} x2={W - PAD.r} y2={yAt(w)}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <text x={PAD.l - 8} y={yAt(w) + 4} textAnchor="end"
            fontSize="11" fill="rgba(255,255,255,0.3)" fontFamily="Inter, sans-serif">
            {w.toFixed(1)}
          </text>
        </g>
      ))}
      {days.map((d, i) => (
        <text key={i} x={xAt(i)} y={H - 6} textAnchor="middle"
          fontSize="11" fontFamily="Inter, sans-serif"
          fill={d.weight !== null ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)'}>
          {d.label}
        </text>
      ))}
      {segments.map((seg, si) => (
        <path key={si}
          d={seg.map((p, pi) => `${pi === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {days.map((d, i) => d.weight !== null && (
        <g key={i}>
          <circle cx={xAt(i)} cy={yAt(d.weight)} r="4" fill="white" opacity="0.9" />
          <text x={xAt(i)} y={yAt(d.weight) - 10} textAnchor="middle"
            fontSize="11" fontWeight="600" fill="rgba(255,255,255,0.65)"
            fontFamily="Inter, sans-serif">
            {d.weight}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Long-term trend chart ────────────────────────────────

function WeightChart({ entries }) {
  if (entries.length < 2) {
    return <p className="chart-empty">Log at least 2 weigh-ins to see your trend.</p>;
  }

  const W = 700, H = 180;
  const PAD = { t: 16, r: 16, b: 36, l: 48 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const recent = entries.slice(-42);
  const weights = recent.map(e => e.weight);
  const lo = Math.min(...weights);
  const hi = Math.max(...weights);
  const spread = hi - lo || 1;
  const yLo = lo - spread * 0.25;
  const yHi = hi + spread * 0.25;

  const xAt = i => PAD.l + (i / (recent.length - 1)) * cW;
  const yAt = w => PAD.t + (1 - (w - yLo) / (yHi - yLo)) * cH;

  const pts = recent.map((e, i) => ({ x: xAt(i), y: yAt(e.weight) }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const reg = recent.length >= 3
    ? linReg(recent.map((e, i) => ({ x: i, y: e.weight })))
    : null;
  const trendLine = reg
    ? `M${xAt(0).toFixed(1)},${yAt(reg.intercept).toFixed(1)} L${xAt(recent.length - 1).toFixed(1)},${yAt(reg.slope * (recent.length - 1) + reg.intercept).toFixed(1)}`
    : null;

  const yTicks = [yLo + (yHi - yLo) * 0.1, (yLo + yHi) / 2, yHi - (yHi - yLo) * 0.1]
    .map(w => ({ y: yAt(w), label: w.toFixed(1) }));

  const xLabels = [
    { x: xAt(0), label: fmtDate(recent[0].date) },
    { x: xAt(recent.length - 1), label: fmtDate(recent[recent.length - 1].date) },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <text x={PAD.l - 8} y={t.y + 4} textAnchor="end"
            fontSize="11" fill="rgba(255,255,255,0.3)" fontFamily="Inter, sans-serif">
            {t.label}
          </text>
        </g>
      ))}
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={H - 8} textAnchor="middle"
          fontSize="11" fill="rgba(255,255,255,0.3)" fontFamily="Inter, sans-serif">
          {l.label}
        </text>
      ))}
      {trendLine && (
        <path d={trendLine} fill="none" stroke="#4ade80" strokeWidth="1.5"
          strokeDasharray="6 4" opacity="0.5" />
      )}
      <path d={line} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" opacity="0.9" />
      ))}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────

export default function BodyTab() {
  const [entries, setEntries]       = useState([]);
  const [todayVal, setTodayVal]     = useState('');
  const [loggedToday, setLoggedToday] = useState(false);
  const [editingDate, setEditingDate] = useState(null);
  const [editVal, setEditVal]       = useState('');
  const [errorMsg, setErrorMsg]     = useState(null);
  const profile = getProfile();

  useEffect(() => {
    const raw = JSON.parse(localStorage.getItem('gainz_bodyweight') || '[]');
    const valid = raw.filter(e => e && e.date && e.weight != null);
    const sorted = valid.sort((a, b) => b.date.localeCompare(a.date));
    setEntries(sorted);
    const todayEntry = sorted.find(e => e.date === todayStr());
    if (todayEntry) { setTodayVal(String(todayEntry.weight)); setLoggedToday(true); }
  }, []);

  const logWeight = () => {
    const w = parseFloat(todayVal);
    if (!w) return;
    const existing = entries.filter(e => e.date !== todayStr());
    const entry = { id: uid(), date: todayStr(), weight: w };
    const updated = [entry, ...existing];
    localStorage.setItem('gainz_bodyweight', JSON.stringify(updated));
    setEntries(updated);
    setLoggedToday(true);
    pushBodyWeight(entry);
  };

  const deleteEntry = (id, date) => {
    try {
      const current = Array.isArray(entries) ? entries : [];
      const updated = current.filter(
        e => e != null && typeof e === 'object' && e.id !== id
      );
      setEntries(updated);
      try {
        localStorage.setItem('gainz_bodyweight', JSON.stringify(updated));
      } catch (storageErr) {
        console.warn('[BodyTab] localStorage write failed:', storageErr);
      }
      if (typeof date === 'string' && date === todayStr()) {
        setTodayVal('');
        setLoggedToday(false);
      }
      setEditingDate(prev => (prev === date ? null : prev));
      deleteSupabaseBodyWeight(date);
    } catch (err) {
      console.error('[BodyTab] deleteEntry failed:', err);
      setErrorMsg(`deleteEntry: ${err?.message || String(err)}`);
    }
  };

  const startEdit = entry => {
    setEditingDate(entry.date);
    setEditVal(String(entry.weight));
  };

  const saveEdit = () => {
    const w = parseFloat(editVal);
    if (!w || !editingDate) { setEditingDate(null); return; }
    const updated = entries.map(e => e.date === editingDate ? { ...e, weight: w } : e);
    localStorage.setItem('gainz_bodyweight', JSON.stringify(updated));
    setEntries(updated);
    if (editingDate === todayStr()) setTodayVal(String(w));
    const edited = updated.find(e => e.date === editingDate);
    if (edited) pushBodyWeight(edited);
    setEditingDate(null);
  };

  const safeEntries = Array.isArray(entries)
    ? entries.filter(e => e != null && typeof e === 'object' && e.id != null && e.date && e.weight != null)
    : [];
  const chronological = [...safeEntries].reverse();
  const weeklyAvgs = getWeeklyAverages(chronological);
  const weeklyWithDelta = weeklyAvgs.map((w, i) => ({
    ...w,
    delta: i > 0 ? parseFloat((w.avg - weeklyAvgs[i - 1].avg).toFixed(2)) : null,
  }));
  const displayWeeks = [...weeklyWithDelta].reverse().slice(0, 8);

  let trend = null;
  if (weeklyAvgs.length >= 2) {
    const delta = weeklyAvgs[weeklyAvgs.length - 1].avg - weeklyAvgs[weeklyAvgs.length - 2].avg;
    const status = delta >= profile.goalMin && delta <= profile.goalMax ? 'on-track'
      : delta < profile.goalMin ? 'below' : 'above';
    trend = { delta, status };
  }

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="tab-pane">

      <div className="section-header">
        <h2>Body</h2>
        <span className="date-badge">{dateLabel}</span>
      </div>

      {errorMsg && (
        <div style={{
          background: '#7f1d1d', color: '#fca5a5', border: '1px solid #dc2626',
          borderRadius: 8, padding: '12px 14px', margin: '0 0 12px',
          fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
        }}>
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>
      )}

      {/* Log today */}
      <div className="card">
        <h3>Today's Weight</h3>
        <div className="weight-entry-row">
          <div className="weight-input-group">
            <input
              type="number" step="0.1" className="weight-num-input"
              placeholder="172.0"
              value={todayVal}
              onChange={e => setTodayVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && logWeight()}
            />
            <span className="weight-lbs">lbs</span>
          </div>
          <button
            className={`btn-primary${loggedToday ? ' saved' : ''}`}
            onClick={logWeight}
          >
            {loggedToday ? 'Updated' : 'Log Weight'}
          </button>
        </div>
      </div>

      {/* Last 7 days chart */}
      {safeEntries.length > 0 && (
        <div className="card">
          <h3>Last 7 Days</h3>
          <Last7DaysChart entries={safeEntries} />
        </div>
      )}

      {/* Long-term trend chart */}
      {safeEntries.length > 0 && (
        <div className="card">
          <div className="card-row-hd">
            <h3>Trend</h3>
            {trend && (
              <span className={`trend-badge ${trend.status}`}>
                {trend.delta > 0 ? '+' : ''}{trend.delta.toFixed(2)} lbs/wk
                &nbsp;·&nbsp;
                {trend.status === 'on-track' ? 'On Track'
                  : trend.status === 'below' ? 'Below Target' : 'Above Target'}
              </span>
            )}
          </div>
          <WeightChart entries={chronological} />
          {trend && (
            <p className="trend-note">
              {trend.status === 'on-track' &&
                `Averaging +${trend.delta.toFixed(2)} lbs/wk — right in your goal range of +${profile.goalMin}–${profile.goalMax} lbs/wk.`}
              {trend.status === 'below' &&
                `+${trend.delta.toFixed(2)} lbs/wk is below your ${profile.goalMin}–${profile.goalMax} lbs/wk target. Consider adding ~150–200 kcal/day.`}
              {trend.status === 'above' &&
                `+${trend.delta.toFixed(2)} lbs/wk is above your ${profile.goalMin}–${profile.goalMax} lbs/wk target. Consider trimming ~150–200 kcal/day.`}
            </p>
          )}
        </div>
      )}

      {/* Bottom section: weekly averages + log */}
      {safeEntries.length > 0 && (
        <div className="body-two-col">

          <div className="card">
            <h3>Weekly Averages</h3>
            {displayWeeks.length === 0 ? (
              <p className="empty-state" style={{ padding: '12px 0' }}>Keep logging to see weekly averages.</p>
            ) : (
              <div className="wk-table">
                {displayWeeks.map(w => (
                  <div key={w.week} className="wk-row">
                    <span className="wk-label">
                      {fmtDate(w.week)}
                      <span className="wk-count">{w.count}d</span>
                    </span>
                    <span className="wk-avg">{w.avg.toFixed(1)} lbs</span>
                    {w.delta !== null && (
                      <span className={`wk-delta ${w.delta >= 0 ? 'pos' : 'neg'}`}>
                        {w.delta > 0 ? '+' : ''}{w.delta.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3>Log</h3>
            <div className="wl-list">
              {safeEntries.slice(0, 20).map(e => (
                <div key={e.id} className="wl-item">
                  <span className="wl-date">
                    {fmtDate(e.date)}
                    {e.date === todayStr() && <span className="today-pill">Today</span>}
                  </span>
                  {editingDate === e.date ? (
                    <input
                      type="number" step="0.1" className="wl-edit-input"
                      value={editVal}
                      onChange={ev => setEditVal(ev.target.value)}
                      onKeyDown={ev => {
                        if (ev.key === 'Enter') saveEdit();
                        if (ev.key === 'Escape') setEditingDate(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className="wl-val">{e.weight} lbs</span>
                  )}
                  {editingDate === e.date ? (
                    <button className="icon-btn confirm" onClick={saveEdit}>✓</button>
                  ) : (
                    <button className="icon-btn" onClick={() => startEdit(e)}>✎</button>
                  )}
                  <button className="icon-btn danger" onClick={() => deleteEntry(e.id, e.date)}>×</button>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {safeEntries.length === 0 && (
        <p className="empty-state">No weight logged yet. Enter today's weight above to start tracking your trend.</p>
      )}

    </div>
  );
}
