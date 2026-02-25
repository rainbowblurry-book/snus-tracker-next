'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// ── SUPABASE CLIENT (client-side for realtime) ────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── TYPES ─────────────────────────────────────────────────
type Entry = [number, number, number, number]; // [ts, portions, mg, cost]
type Cfg = { mg: number; p10: number; ppb: number };
type AppState = { e: Entry[]; b: number; bu: number; la: number | null; cfg: Cfg };

const DEFAULT: AppState = { e: [], b: 10, bu: 0, la: null, cfg: { mg: 10, p10: 269, ppb: 20 } };

// ── HELPERS ───────────────────────────────────────────────
const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const todayK = () => dayKey(Date.now());
const fmt2 = (n: number) => n.toFixed(2);
const cpp = (cfg: Cfg) => cfg.p10 / (cfg.ppb * 10);

function computeStats(state: AppState) {
  const now = Date.now(), tKey = todayK();
  const w7 = now - 7 * 86400000, w14 = now - 14 * 86400000;
  let lp = 0, lm = 0, lc = 0, tp = 0, tm = 0, tc = 0, wp = 0, wm = 0, wc = 0, pp = 0;
  const buckets: Record<string, number> = {};
  for (const [ts, p, mg, cost] of state.e) {
    const k = dayKey(ts);
    lp += p; lm += mg; lc += cost;
    if (k === tKey) { tp += p; tm += mg; tc += cost; }
    if (ts >= w7) { wp += p; wm += mg; wc += cost; }
    if (ts >= w14 && ts < w7) pp += p;
    buckets[k] = (buckets[k] || 0) + p;
  }
  return { lp, lm, lc, tp, tm, tc, wp, wm, wc, pp, buckets };
}

function getLevel(tp: number, avg: number) {
  if (!avg) return 'neutral';
  if (tp < avg * 0.85) return 'good';
  if (tp > avg * 1.25) return 'alert';
  if (tp > avg * 1.05) return 'caution';
  return 'neutral';
}

function getInsight(wp: number, pp: number) {
  if (!pp && !wp) return { msg: 'Start logging to see your weekly pattern.', type: 'neutral', icon: '💬' };
  if (!pp) return { msg: 'Good start. Trends appear after 2 weeks of data.', type: 'good', icon: '🌱' };
  const pct = ((wp - pp) / pp) * 100;
  if (pct < -15) return { msg: `Down ${Math.abs(pct).toFixed(0)}% from last week. Real progress.`, type: 'good', icon: '📉' };
  if (pct < -5) return { msg: 'Slightly down from last week. Keep the momentum.', type: 'good', icon: '👍' };
  if (pct < 5) return { msg: 'About the same as last week. Try one fewer today.', type: 'neutral', icon: '〰️' };
  if (pct < 20) return { msg: `Up ${pct.toFixed(0)}% vs last week. Today is a good day to reset.`, type: 'caution', icon: '⚡' };
  return { msg: `Up ${pct.toFixed(0)}% vs last week. Try cutting back starting now.`, type: 'alert', icon: '🎯' };
}

function lastTakenText(entries: Entry[]) {
  const today = entries.filter(([ts]) => dayKey(ts) === todayK());
  if (!today.length) return 'No snus yet today';
  const t = new Date(today[today.length - 1][0]);
  return `Last snus: ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

// ── WEEK BAR CHART ────────────────────────────────────────
// Always shows Sun→Sat of the current week
// Active days show portion count above the bar
function BarChart({ buckets }: { buckets: Record<string, number> }) {
  // Build Sun→Sat of current week
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - dayOfWeek + i); // i=0 → Sunday
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en', { weekday: 'short' });
    const isToday = key === todayStr;
    const isFuture = d > today;
    return { key, label, isToday, isFuture };
  });

  const vals = days.map(d => buckets[d.key] || 0);
  const max = Math.max(...vals, 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 100, padding: '0 2px' }}>
      {days.map((d, i) => {
        const val = vals[i];
        const barH = Math.max((val / max) * 64, val > 0 ? 6 : 2);
        const color = d.isToday
          ? 'var(--good)'
          : d.isFuture
          ? 'var(--border)'
          : val > 0
          ? 'var(--ink)'
          : 'var(--border)';
        const opacity = d.isFuture ? 0.3 : d.isToday ? 1 : val > 0 ? 0.6 : 0.35;

        return (
          <div
            key={d.key}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 4,
              height: '100%',
            }}
          >
            {/* Portion count — only show on active days */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: d.isToday ? 'var(--good)' : 'var(--muted)',
              height: 14,
              lineHeight: '14px',
              fontFamily: 'var(--body)',
              visibility: val > 0 ? 'visible' : 'hidden',
            }}>
              {val}
            </div>

            {/* Bar */}
            <div style={{
              width: '100%',
              height: barH,
              borderRadius: 4,
              background: color,
              opacity,
              transition: 'height 0.4s ease',
            }} />

            {/* Day label */}
            <div style={{
              fontSize: 9,
              fontWeight: d.isToday ? 700 : 400,
              color: d.isToday ? 'var(--ink)' : 'var(--dim)',
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
            }}>
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ── TOAST HOOK ────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);
  const show = useCallback((msg: string) => setToast({ msg, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);
  return { toast, show };
}

// ── KEEPALIVE: prevents Supabase free tier pause ──────────
// Runs a lightweight query every 6 days to keep the project active
function useKeepalive() {
  useEffect(() => {
    const SIX_DAYS = 6 * 24 * 60 * 60 * 1000;
    const STORAGE_KEY = 'snus_last_ping';
    async function ping() {
      const last = parseInt(localStorage.getItem(STORAGE_KEY) || '0');
      if (Date.now() - last < SIX_DAYS) return;
      try {
        await supabase.from('state').select('key').limit(1);
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch (_) {}
    }
    ping();
    const interval = setInterval(ping, 60 * 60 * 1000); // check every hour
    return () => clearInterval(interval);
  }, []);
}

// ── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState<AppState>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addVal, setAddVal] = useState('');
  const [settingsForm, setSettingsForm] = useState({ mg: '10', p10: '269', ppb: '20', boxes: '10' });
  const [resetConfirm, setResetConfirm] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast, show: showToast } = useToast();
  useKeepalive();

  // ── LOAD DATA ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setState(prev => ({ ...prev, ...data }));
    } catch (err) {
      showToast('Could not load data');
      console.error('Load error:', err);
    }
  }, [showToast]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  // ── REALTIME: instant sync when DB changes ─────────────
  useEffect(() => {
    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portions' }, () => {
        loadData(); // re-fetch whenever portions table changes
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'state' }, () => {
        loadData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // ── SAVE DATA (debounced 800ms) ───────────────────────
  const saveData = useCallback((newState: AppState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const res = await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newState)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        showToast('Sync failed — try again');
      } finally {
        setSyncing(false);
      }
    }, 800);
  }, [showToast]);

  const updateState = useCallback((updater: (s: AppState) => AppState) => {
    setState(prev => {
      const next = updater(prev);
      saveData(next);
      return next;
    });
  }, [saveData]);

  // ── ACTIONS ───────────────────────────────────────────
  function addEntry(p: number) {
    const cost = p * cpp(state.cfg);
    updateState(s => ({ ...s, e: [...s.e, [Date.now(), p, p * s.cfg.mg, cost]], la: p }));
    if (navigator.vibrate) navigator.vibrate(30);
    showToast(`+${p} portion${p > 1 ? 's' : ''}`);
  }

  function undoLast() {
    if (!state.la) return showToast('Nothing to undo');
    updateState(s => {
      let need = s.la!;
      const entries = [...s.e];
      while (need > 0 && entries.length) {
        const last = entries[entries.length - 1];
        if (last[1] <= need) { need -= last[1]; entries.pop(); }
        else { entries[entries.length - 1] = [last[0], last[1] - need, (last[1] - need) * s.cfg.mg, (last[1] - need) * cpp(s.cfg)]; need = 0; }
      }
      return { ...s, e: entries, la: null };
    });
    showToast('Undone ↩');
  }

  function saveSettings() {
    updateState(s => ({
      ...s,
      cfg: { mg: +settingsForm.mg || s.cfg.mg, p10: +settingsForm.p10 || s.cfg.p10, ppb: +settingsForm.ppb || s.cfg.ppb },
      b: Math.max(0, +settingsForm.boxes || 0)
    }));
    setShowSettings(false);
    showToast('Settings saved');
  }

  function resetAll() {
    updateState(() => ({ ...DEFAULT, e: [] }));
    setShowSettings(false);
    setResetConfirm(false);
    showToast('All data cleared');
  }

  // ── COMPUTED ──────────────────────────────────────────
  const s = computeStats(state);
  const avgP7 = s.wp / 7;
  const level = getLevel(s.tp, avgP7);
  const insight = getInsight(s.wp, s.pp);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const levelColor = level === 'good' ? 'var(--good)' : level === 'alert' ? 'var(--alert)' : level === 'caution' ? 'var(--caution)' : 'var(--neutral)';

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 900, fontStyle: 'italic', marginBottom: 16 }}>snus tracker</div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--dim)', animation: `bounce 0.8s ease ${i * 0.15}s infinite` }} />)}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Sora:wght@300;400;500;600&display=swap');
        :root {
          --bg:#faf7f2; --bg2:#f3ede3; --card:#fff; --border:#e8e0d4;
          --ink:#2d2520; --muted:#8a7e74; --dim:#b8ad9e; --neutral:#6b7280;
          --good:#2d7d5a; --good-bg:#edf7f2; --caution:#b45309; --caution-bg:#fef3e2;
          --alert:#c0392b; --alert-bg:#fdf0ee; --sage:#5c7a6b;
          --display:'Playfair Display',Georgia,serif; --body:'Sora',system-ui,sans-serif;
          --r:18px; --r-sm:12px;
        }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:var(--bg);color:var(--ink);font-family:var(--body);font-size:15px;-webkit-font-smoothing:antialiased}
        button{cursor:pointer;font-family:var(--body)}
        input{font-family:var(--body)}
        @keyframes bounce{0%,80%,100%{transform:scale(0.8);opacity:.5}40%{transform:scale(1);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        .card{background:var(--card);border:1.5px solid var(--border);border-radius:var(--r);padding:20px;box-shadow:0 2px 12px rgba(45,37,32,.06)}
        .btn{border:none;border-radius:var(--r-sm);font-weight:600;padding:16px 20px;transition:transform .1s,box-shadow .15s;display:flex;align-items:center;justify-content:center;gap:6px}
        .btn:active{transform:scale(0.97)}
        .btn-primary{background:var(--ink);color:var(--bg);font-size:17px;font-weight:700;box-shadow:0 4px 14px rgba(45,37,32,.2)}
        .btn-secondary{background:var(--bg2);color:var(--ink);font-size:14px;border:1.5px solid var(--border)}
        .btn-ghost{background:transparent;color:var(--muted);font-size:13px;font-weight:500;border:1.5px solid var(--border)}
        .btn-ghost:hover{color:var(--caution);border-color:var(--caution)}
        .icon-btn{width:38px;height:38px;border:1.5px solid var(--border);background:var(--card);border-radius:12px;color:var(--muted);display:grid;place-items:center;font-size:15px;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:all .15s;padding:0}
        .icon-btn:hover{border-color:var(--sage);color:var(--sage)}
        .field-input{width:100%;padding:13px 14px;background:var(--bg);border:1.5px solid var(--border);border-radius:var(--r-sm);color:var(--ink);font-size:17px;outline:none;margin-bottom:16px;transition:border-color .15s}
        .field-input:focus{border-color:var(--sage)}
        .s-label{font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--dim);padding-top:4px}
        .stat-label{font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--dim);margin-bottom:6px}
        .field-label{display:block;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
      `}</style>

      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 20px 0', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.02em' }}>
          snus<span style={{ color: 'var(--sage)', fontStyle: 'normal', fontWeight: 600, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', marginLeft: 6, opacity: 0.7 }}>tracker</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" onClick={loadData} title="Sync" style={{ fontSize: 14, animation: syncing ? 'spin 1s linear infinite' : 'none' }}>🔄</button>
          <button className="icon-btn" onClick={() => { setSettingsForm({ mg: String(state.cfg.mg), p10: String(state.cfg.p10), ppb: String(state.cfg.ppb), boxes: String(state.b) }); setResetConfirm(false); setShowSettings(true); }}>⚙</button>
        </div>
      </header>

      {/* MAIN */}
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '16px 20px 48px', display: 'grid', gap: 12 }}>

        {/* TODAY HERO */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative', animation: 'fadeUp 0.4s ease' }}>
          <div style={{ position: 'absolute', top: -60, right: -60, width: 180, height: 180, borderRadius: '50%', background: 'var(--bg2)', pointerEvents: 'none' }} />
          <div style={{ padding: '24px 20px 20px', position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 8 }}>
              Today — {days[new Date().getDay()]}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 4 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(60px,20vw,84px)', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: s.wp ? levelColor : 'var(--neutral)', transition: 'color 0.4s ease', paddingLeft: 4 }}>
                {s.tp}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', paddingBottom: 12 }}>portions</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{s.tm} mg nicotine · {fmt2(s.tc)} SEK</div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>{lastTakenText(state.e)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => addEntry(1)}>+ 1 portion</button>
              <button className="btn btn-secondary" onClick={() => { setAddVal(''); setShowAdd(true); }}>Add number</button>
              <button className="btn btn-ghost" onClick={undoLast} style={{ gridColumn: '1/-1' }}>↩ Undo last action</button>
            </div>
          </div>
          <div style={{ height: 4, background: s.wp ? `linear-gradient(90deg, ${levelColor}, ${levelColor}88)` : 'var(--border)', transition: 'background 0.4s ease' }} />
        </div>

        {/* INSIGHT */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', boxShadow: '0 2px 12px rgba(45,37,32,.06)', animation: 'fadeUp 0.4s ease 0.09s both' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0, background: insight.type === 'good' ? 'var(--good-bg)' : insight.type === 'caution' ? 'var(--caution-bg)' : insight.type === 'alert' ? 'var(--alert-bg)' : '#f5f0e8' }}>
            {insight.icon}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>{insight.msg}</div>
        </div>

        {/* STATS */}
        <div className="s-label" style={{ animation: 'fadeUp 0.4s ease 0.13s both' }}>Last 7 days</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, animation: 'fadeUp 0.4s ease 0.17s both' }}>
          {[
            { label: 'Avg / day', val: avgP7 ? avgP7.toFixed(1) : '—', sub: `${s.wp} total this week` },
            { label: 'Nicotine / day', val: avgP7 ? `${(s.wm / 7).toFixed(0)}mg` : '—', sub: `${fmt2(s.wc)} SEK this week` }
          ].map(({ label, val, sub }) => (
            <div key={label} className="card" style={{ padding: 16 }}>
              <div className="stat-label">{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(22px,7vw,28px)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em' }}>{val}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* CHART */}
        <div className="card" style={{ animation: 'fadeUp 0.4s ease 0.21s both' }}>
          <div style={{ fontSize: 16, fontFamily: 'var(--display)', fontWeight: 700, fontStyle: 'italic', marginBottom: 14 }}>This week</div>
          <BarChart buckets={s.buckets} />
        </div>

        {/* BOXES */}
        <div className="s-label" style={{ animation: 'fadeUp 0.4s ease 0.25s both' }}>Box inventory</div>
        <div className="card" style={{ animation: 'fadeUp 0.4s ease 0.29s both' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div className="stat-label">Boxes left</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 42, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: state.b <= 0 ? 'var(--alert)' : state.b <= 2 ? 'var(--caution)' : 'var(--ink)' }}>{state.b}</div>
            </div>
            {state.b <= 2 && <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--alert-bg)', border: '1.5px solid rgba(192,57,43,.2)', color: 'var(--alert)', padding: '3px 10px', borderRadius: 999 }}>⚠ Low stock</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: '−1 Used', action: () => { if (state.b <= 0) return showToast('Already at 0'); updateState(s => ({ ...s, b: s.b - 1, bu: (s.bu || 0) + 1 })); showToast('−1 box'); }, style: { borderColor: 'rgba(192,57,43,.25)', color: 'var(--alert)', background: 'var(--alert-bg)' } },
              { label: '+1 Bought', action: () => { updateState(s => ({ ...s, b: s.b + 1 })); showToast('+1 box'); }, style: { borderColor: 'rgba(45,125,90,.25)', color: 'var(--good)', background: 'var(--good-bg)' } },
              { label: '+10 Bought', action: () => { updateState(s => ({ ...s, b: s.b + 10 })); showToast('+10 boxes'); }, style: { borderColor: 'rgba(45,125,90,.25)', color: 'var(--good)', background: 'var(--good-bg)' } },
            ].map(({ label, action, style }) => (
              <button key={label} onClick={action} style={{ padding: '10px 6px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', textAlign: 'center', transition: 'all .15s', ...style }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* LIFETIME */}
        <div className="s-label" style={{ animation: 'fadeUp 0.4s ease 0.33s both' }}>All time</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--card)', boxShadow: '0 2px 12px rgba(45,37,32,.06)', animation: 'fadeUp 0.4s ease 0.37s both' }}>
          {[
            { num: s.lp, label: 'Portions' },
            { num: state.bu || 0, label: 'Boxes used' },
            { num: `${fmt2(s.lc)} SEK`, label: 'Spent' }
          ].map(({ num, label }, i) => (
            <div key={label} style={{ padding: '16px 14px', borderRight: i < 2 ? '1.5px solid var(--border)' : 'none' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(16px,4.5vw,20px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{num}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </main>

      {/* ADD MODAL */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,37,32,.35)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 9000 }} onClick={() => setShowAdd(false)}>
          <div className="card" style={{ width: 'min(92vw,340px)', animation: 'slideIn 0.2s ease' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, fontStyle: 'italic', marginBottom: 16 }}>Add portions</div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>How many portions?</label>
            <input className="field-input" type="number" min="1" placeholder="e.g. 6" inputMode="numeric" value={addVal}
              onChange={e => setAddVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { const v = Number(addVal); if (v > 0) { addEntry(v); setShowAdd(false); } } }}
              autoFocus />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: 13, background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--muted)', fontWeight: 600, fontSize: 14 }}>Cancel</button>
              <button onClick={() => { const v = Number(addVal); if (v > 0) { addEntry(v); setShowAdd(false); } }} style={{ padding: 13, background: 'var(--ink)', border: 'none', borderRadius: 'var(--r-sm)', color: 'var(--bg)', fontWeight: 700, fontSize: 14 }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,37,32,.35)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 9000 }} onClick={() => setShowSettings(false)}>
          <div className="card" style={{ width: 'min(92vw,340px)', animation: 'slideIn 0.2s ease', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, fontStyle: 'italic', marginBottom: 16 }}>Settings</div>
            {[
              { label: 'mg per portion', key: 'mg' },
              { label: 'Price per 10-box pack (SEK)', key: 'p10' },
              { label: 'Portions per box', key: 'ppb' },
              { label: 'Boxes left', key: 'boxes' }
            ].map(({ label, key }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>{label}</label>
                <input className="field-input" type="number" min="0" inputMode="numeric"
                  value={settingsForm[key as keyof typeof settingsForm]}
                  onChange={e => setSettingsForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setShowSettings(false)} style={{ padding: 13, background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--muted)', fontWeight: 600, fontSize: 14 }}>Cancel</button>
              <button onClick={saveSettings} style={{ padding: 13, background: 'var(--ink)', border: 'none', borderRadius: 'var(--r-sm)', color: 'var(--bg)', fontWeight: 700, fontSize: 14 }}>Save</button>
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
            {!resetConfirm ? (
              <button onClick={() => setResetConfirm(true)} style={{ width: '100%', padding: 12, background: 'var(--alert-bg)', border: '1.5px solid rgba(192,57,43,.2)', borderRadius: 'var(--r-sm)', color: 'var(--alert)', fontWeight: 600, fontSize: 13 }}>⚠ Delete all data</button>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 8 }}>Are you sure? This cannot be undone.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={() => setResetConfirm(false)} style={{ padding: 13, background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--muted)', fontWeight: 600, fontSize: 14 }}>Cancel</button>
                  <button onClick={resetAll} style={{ padding: 13, background: 'var(--alert-bg)', border: '1.5px solid rgba(192,57,43,.2)', borderRadius: 'var(--r-sm)', color: 'var(--alert)', fontWeight: 600, fontSize: 14 }}>Yes, delete</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div key={toast.id} style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--bg)', fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 999, boxShadow: '0 8px 24px rgba(45,37,32,.25)', whiteSpace: 'nowrap', animation: 'toastIn 0.3s cubic-bezier(.34,1.56,.64,1)', zIndex: 9999, pointerEvents: 'none' }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}