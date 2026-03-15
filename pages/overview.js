// ============================================================
// OVERVIEW PAGE
// ============================================================
import { state, allTrades, calcStats, fmtK, fmtMoney, getStartingBalance, refresh } from '../js/app.js';
import { CHART_DEFAULTS } from '../js/utils.js';

let charts = {};

function dc(id) {
  if(charts[id]) { charts[id].destroy(); delete charts[id]; }
}

export function renderOverview(container) {
  const trades = allTrades();
  const s      = calcStats(trades);

  container.innerHTML = `
    <div class="kpi-grid" id="kpiGrid"></div>
    <div class="two-col">
      <div class="chart-card">
        <div class="chart-title">EQUITY CURVE <span id="eqLbl"></span></div>
        <canvas id="eqChart"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">DAILY P&L</div>
        <canvas id="dayChart"></canvas>
      </div>
    </div>
    <div class="two-col">
      <div class="chart-card">
        <div class="chart-title">BY INSTRUMENT</div>
        <canvas id="idxChart"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">MONTHLY P&L</div>
        <canvas id="moChart"></canvas>
      </div>
    </div>
    <div class="insight" id="insightBox"></div>
  `;

  renderKPIs(trades, s);
  buildEquityCurve(trades);
  buildDailyPnl(trades);
  buildInstrumentChart(trades);
  buildMonthlyPnl(trades);
  renderInsight(s);
}

function renderKPIs(trades, s) {
  const el = document.getElementById('kpiGrid');
  if(!el) return;

  const acctLabel = {
    all: 'All accounts', hist: 'Deriv', live: 'Deriv Live',
  }[state.activeAcct] || state.activeAcct + ' Account';

  // Monthly breakdown
  const months = {};
  trades.forEach(t => {
    const m = t.date.slice(0,7);
    if(!months[m]) months[m] = [];
    months[m].push(t);
  });

  const kpis = [
    { l:'Net P/L',       v: fmtK(s.tot),                     c: s.tot>=0?'g':'r', sub: acctLabel },
    { l:'Total Trades',  v: s.n,                              c: 'b',              sub: `${s.w}W · ${s.l}L` },
    { l:'Win Rate',      v: s.wr.toFixed(1)+'%',              c: s.wr>=40?'g':'r', sub: `${s.w} wins of ${s.n}` },
    { l:'Profit Factor', v: s.pf>=99?'∞':s.pf.toFixed(2),    c: s.pf>=1.5?'g':'r',sub: 'Target ≥ 1.5' },
    { l:'Avg RRR',       v: s.rrr.toFixed(2),                 c: 'o',              sub: 'Risk:Reward' },
    { l:'Expectancy',    v: fmtMoney(s.exp,0),                c: s.exp>=0?'g':'r', sub: 'Per trade' },
    { l:'Best Trade',    v: '+$'+s.best.toFixed(0),           c: 'g',              sub: 'Largest win' },
    { l:'Worst Trade',   v: '-$'+Math.abs(s.worst).toFixed(0),c: 'r',              sub: 'Largest loss' },
  ];

  // Add monthly KPIs (last 3 months)
  Object.keys(months).sort().slice(-3).forEach(m => {
    const ms    = calcStats(months[m]);
    const label = new Date(m+'-01').toLocaleString('default',{month:'short',year:'2-digit'});
    kpis.push({ l: label, v: fmtK(ms.tot), c: ms.tot>=0?'g':'r', sub: `${ms.n} trades` });
  });

  // Journal count
  const journalCount = state.journalEntries.filter(j =>
    state.activeAcct === 'all' || j.account === state.activeAcct || (!j.account && (state.activeAcct==='hist'||state.activeAcct==='live'))
  ).length;
  kpis.push({ l:'Journal Entries', v: journalCount, c: 'p', sub: acctLabel });

  el.innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.c}">
      <div class="kpi-label">${k.l}</div>
      <div class="kpi-value ${k.c}">${k.v}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');
}

function buildEquityCurve(trades) {
  dc('eq');
  const sorted = [...trades].sort((a,b) => a.date.localeCompare(b.date));
  const start  = getStartingBalance();
  let bal = start;
  const labels = ['Start'];
  const data   = [bal];

  sorted.forEach(t => {
    bal += t.pnl;
    labels.push(t.date.slice(5));
    data.push(parseFloat(bal.toFixed(2)));
  });

  const lbl = document.getElementById('eqLbl');
  if(lbl) lbl.textContent = '$' + data[data.length-1].toLocaleString();

  const ctx = document.getElementById('eqChart')?.getContext('2d');
  if(!ctx) return;

  const g = ctx.createLinearGradient(0,0,0,230);
  g.addColorStop(0,'rgba(0,229,176,0.2)');
  g.addColorStop(1,'rgba(0,229,176,0)');

  charts['eq'] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor:'#00e5b0', backgroundColor:g, borderWidth:2, pointRadius:0, pointHoverRadius:4, fill:true, tension:0.3 }] },
    options: {
      responsive: true,
      interaction: { mode:'index', intersect:false },
      plugins: { legend:{display:false}, tooltip: { ...CHART_DEFAULTS.tooltip, callbacks: { label: c => 'Balance: $'+c.parsed.y.toLocaleString() } } },
      scales: {
        x: { ticks: { ...CHART_DEFAULTS.ticks, maxTicksLimit:8 }, grid: CHART_DEFAULTS.grid },
        y: { ticks: { ...CHART_DEFAULTS.ticks, callback: v => '$'+v.toLocaleString() }, grid: CHART_DEFAULTS.grid },
      },
    },
  });
}

function buildDailyPnl(trades) {
  dc('day');
  const m = {};
  trades.forEach(t => { m[t.date] = (m[t.date]||0) + t.pnl; });
  const days = Object.keys(m).sort();
  const vals = days.map(d => parseFloat(m[d].toFixed(2)));
  const ctx  = document.getElementById('dayChart')?.getContext('2d');
  if(!ctx) return;

  charts['day'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: days.map(d => d.slice(5)), datasets: [{ data: vals, backgroundColor: vals.map(v => v>=0?'rgba(0,229,176,0.7)':'rgba(255,77,106,0.7)'), borderRadius:4 }] },
    options: {
      responsive: true,
      plugins: { legend:{display:false}, tooltip: { ...CHART_DEFAULTS.tooltip, callbacks: { label: c => (c.parsed.y>=0?'+':'')+'$'+c.parsed.y.toFixed(2) } } },
      scales: {
        x: { ticks: CHART_DEFAULTS.ticks, grid: { display:false } },
        y: { ticks: { ...CHART_DEFAULTS.ticks, callback: v => '$'+v }, grid: CHART_DEFAULTS.grid },
      },
    },
  });
}

function buildInstrumentChart(trades) {
  dc('idx');
  const m = {};
  trades.forEach(t => { m[t.idx] = (m[t.idx]||0)+1; });
  const ctx = document.getElementById('idxChart')?.getContext('2d');
  if(!ctx || !Object.keys(m).length) return;

  charts['idx'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(m),
      datasets: [{ data: Object.values(m), backgroundColor:['#00e5b0','#3d9bff','#f0b429','#a78bfa','#ff4d6a','#fb923c'], borderWidth:0, hoverOffset:6 }],
    },
    options: {
      responsive: true, cutout: '65%',
      plugins: { legend: { position:'right', labels:{ color:'rgba(232,234,240,0.8)', font:{size:10}, padding:10 } } },
    },
  });
}

function buildMonthlyPnl(trades) {
  dc('mo');
  const m = {};
  trades.forEach(t => { const mo = t.date.slice(0,7); m[mo] = (m[mo]||0)+t.pnl; });
  const keys = Object.keys(m).sort();
  const ctx  = document.getElementById('moChart')?.getContext('2d');
  if(!ctx) return;

  charts['mo'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: keys, datasets: [{ data: keys.map(k => parseFloat(m[k].toFixed(2))), backgroundColor: keys.map(k => m[k]>=0?'rgba(0,229,176,0.7)':'rgba(255,77,106,0.7)'), borderRadius:6 }] },
    options: {
      responsive: true,
      plugins: { legend:{display:false}, tooltip: { ...CHART_DEFAULTS.tooltip, callbacks: { label: c => (c.parsed.y>=0?'+':'')+'$'+c.parsed.y.toFixed(2) } } },
      scales: {
        x: { ticks: CHART_DEFAULTS.ticks, grid:{ display:false } },
        y: { ticks: { ...CHART_DEFAULTS.ticks, callback: v => '$'+v }, grid: CHART_DEFAULTS.grid },
      },
    },
  });
}

function renderInsight(s) {
  const el = document.getElementById('insightBox');
  if(!el) return;
  const label = { all:'All Accounts', hist:'Deriv', live:'Deriv Live' }[state.activeAcct] || state.activeAcct+' Account';
  if(!s.n) {
    el.innerHTML = `<strong>Welcome to Trading Journal!</strong> No trades loaded yet. Connect your <strong style="color:var(--green)">Deriv API</strong> or import an <strong style="color:var(--gold)">MT5 file</strong> to get started.`;
    return;
  }
  const ok = s.pf >= 1.5;
  el.innerHTML = `
    <strong>${label} — ${ok ? '✅ PASSING TARGET' : '⚠️ BELOW TARGET'}</strong>
    Net P/L: <strong style="color:${s.tot>=0?'var(--green)':'var(--red)'}">${fmtMoney(s.tot,0)}</strong> ·
    Profit Factor: <strong>${s.pf>=99?'∞':s.pf.toFixed(2)}</strong> ·
    Win Rate: <strong>${s.wr.toFixed(1)}%</strong> ·
    RRR: <strong>${s.rrr.toFixed(2)}</strong> ·
    Trades: <strong>${s.n}</strong>
  `;
}
