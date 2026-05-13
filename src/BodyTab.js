import { useState, useEffect } from 'react';
import { uid, todayStr, getProfile } from './utils';

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
  const d = new Date(dateStr + 'T12:00:00');
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  return sun.toISOString().slice(0, 10);
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getWeeklyAverages(entries) {
  const map = {};
  entries.forEach(e => {
    const w = weekOf(e.date);
    if (!map[w]) map[w] = [];
    map[w].push(e.weight);
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, ws]) => ({
      week,
      avg: parseFloat((ws.reduce((s, w) => s + w, 0) / ws.length).toFixed(2)),
      count: ws.length,
    }));
}

// ── SVG Chart ────────────────────────────────────────────

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

  // Y grid labels
  const yTicks = [yLo + (yHi - yLo) * 0.1, (yLo + yHi) / 2, yHi - (yHi - yLo) * 0.1]
    .map(w => ({ y: yAt(w), label: w.toFixed(1) }));

  // X labels (first + last)
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
  const [entries, setEntries] = useState([]);
  const [todayVal, setTodayVal] = useState('');
  const [loggedToday, setLoggedToday] = useState(false);
  const profile = getProfile();

  useEffect(() => {
    const raw = JSON.parse(localStorage.getItem('gainz_bodyweight') || '[]');
    const sorted = raw.sort((a, b) => b.date.localeCompare(a.date));
    setEntries(sorted);
    const todayEntry = sorted.find(e => e.date === todayStr());
    if (todayEntry) { setTodayVal(String(todayEntry.weight)); setLoggedToday(true); }
  }, []);

  const logWeight = () => {
    const w = parseFloat(todayVal);
    if (!w) return;
    const existing = entries.filter(e => e.date !== todayStr());
    const updated = [{ id: uid(), date: todayStr(), weight: w }, ...existing];
    localStorage.setItem('gainz_bodyweight', JSON.stringify(updated));
    setEntries(updated);
    setLoggedToday(true);
  };

  const deleteEntry = date => {
    const updated = entries.filter(e => e.date !== date);
    localStorage.setItem('gainz_bodyweight', JSON.stringify(updated));
    setEntries(updated);
    if (date === todayStr()) { setTodayVal(''); setLoggedToday(false); }
  };

  const chronological = [...entries].reverse();
  const weeklyAvgs = getWeeklyAverages(chronological);
  const weeklyWithDelta = weeklyAvgs.map((w, i) => ({
    ...w,
    delta: i > 0 ? parseFloat((w.avg - weeklyAvgs[i - 1].avg).toFixed(2)) : null,
  }));
  const displayWeeks = [...weeklyWithDelta].reverse().slice(0, 8);

  // Trend status from last two complete weeks
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

      {/* Chart + trend */}
      {entries.length > 0 && (
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
      {entries.length > 0 && (
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
              {entries.slice(0, 20).map(e => (
                <div key={e.id} className="wl-item">
                  <span className="wl-date">
                    {fmtDate(e.date)}
                    {e.date === todayStr() && <span className="today-pill">Today</span>}
                  </span>
                  <span className="wl-val">{e.weight} lbs</span>
                  <button className="icon-btn danger" onClick={() => deleteEntry(e.date)}>×</button>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {entries.length === 0 && (
        <p className="empty-state">No weight logged yet. Enter today's weight above to start tracking your trend.</p>
      )}

    </div>
  );
}
