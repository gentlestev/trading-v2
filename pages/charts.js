// ============================================================
// CHARTS PAGE
// ============================================================
import { allTrades, getStartingBalance } from '../js/app.js';
import { CHART_DEFAULTS } from '../js/utils.js';

let charts = {};
function dc(id) { if(charts[id]) { charts[id].destroy(); delete charts[id]; } }

export function renderCharts(container) {
  container.innerHTML = `
    <div class="two-col">
      <div class="chart-card"><div class="chart-title">WIN / LOSS COUNT</div><canvas id="wlChart"></canvas></div>
      <div class="chart-card"><div class="chart-title">P/L BY INSTRUMENT</div><canvas id="ipChart"></canvas></div>
    </div>
    <div class="chart-card"><div class="chart-title">FULL EQUITY CURVE — ALL TIME</div><canvas id="feChart"></canvas></div>
    <div class="chart-card"><div class="chart-title">TRADE DISTRIBUTION BY DAY</div><canvas id="dowChart"></canvas></div>
  `;

  const trades = allTrades();
  buildWinLoss(trades);
  buildByInstrument(trades);
  buildFullEquity(trades);
  buildDayOfWeek(trades);
}

function buildWinLoss(trades) {
  dc('wl');
  const w = trades.filter(t=>t.pnl>0);
  const l = trades.filter(t=>t.pnl<0);
  const ctx = document.getElementById('wlChart')?.getContext('2d');
  if(!ctx) return;
  const aw = w.length ? w.reduce((s,t)=>s+t.pnl,0)/w.length : 0;
  const al = l.length ? Math.abs(l.reduce((s,t)=>s+t.pnl,0)/l.length) : 0;

  charts['wl'] = new Chart(ctx, {
    type:'bar',
    data:{ labels:['Wins','Losses'], datasets:[
      { label:'Count', data:[w.length,l.length], backgroundColor:['rgba(0,229,176,0.7)','rgba(255,77,106,0.7)'], borderRadius:6, yAxisID:'y' },
      { label:'Avg $', data:[aw,al], backgroundColor:['rgba(0,229,176,0.3)','rgba(255,77,106,0.3)'], borderRadius:6, yAxisID:'y1' },
    ]},
    options:{
      responsive:true,
      plugins:{ legend:{ labels:{ color:'rgba(232,234,240,0.8)', font:{size:9} } }, tooltip:CHART_DEFAULTS.tooltip },
      scales:{
        y:  { ticks:CHART_DEFAULTS.ticks, grid:CHART_DEFAULTS.grid },
        y1: { position:'right', ticks:{ ...CHART_DEFAULTS.ticks, callback:v=>'$'+v.toFixed(0) }, grid:{display:false} },
      },
    },
  });
}

function buildByInstrument(trades) {
  dc('ip');
  const ids = ['V10','V25','V50','V75','V100'];
  const pn  = ids.map(i => trades.filter(t=>t.idx===i).reduce((s,t)=>s+t.pnl,0));
  const ctx = document.getElementById('ipChart')?.getContext('2d');
  if(!ctx) return;

  charts['ip'] = new Chart(ctx, {
    type:'bar',
    data:{ labels:ids.map(i=>'Vol '+i.slice(1)), datasets:[{ data:pn.map(v=>parseFloat(v.toFixed(2))), backgroundColor:pn.map(v=>v>=0?'rgba(0,229,176,0.7)':'rgba(255,77,106,0.7)'), borderRadius:6 }] },
    options:{
      responsive:true, indexAxis:'y',
      plugins:{ legend:{display:false}, tooltip:{ ...CHART_DEFAULTS.tooltip, callbacks:{ label:c=>(c.parsed.x>=0?'+':'')+'$'+c.parsed.x.toFixed(2) } } },
      scales:{
        x:{ ticks:{ ...CHART_DEFAULTS.ticks, callback:v=>'$'+v }, grid:CHART_DEFAULTS.grid },
        y:{ ticks:CHART_DEFAULTS.ticks, grid:{display:false} },
      },
    },
  });
}

function buildFullEquity(trades) {
  dc('fe');
  const sorted = [...trades].sort((a,b)=>a.date.localeCompare(b.date));
  let bal = getStartingBalance();
  const ll=['Start'], dd=[bal];
  sorted.forEach((t,i) => { bal+=t.pnl; ll.push('#'+(i+1)); dd.push(parseFloat(bal.toFixed(2))); });
  const ctx = document.getElementById('feChart')?.getContext('2d');
  if(!ctx) return;
  const gg = ctx.createLinearGradient(0,0,0,230);
  gg.addColorStop(0,'rgba(0,229,176,0.18)'); gg.addColorStop(1,'rgba(0,229,176,0)');

  charts['fe'] = new Chart(ctx, {
    type:'line',
    data:{ labels:ll, datasets:[{ data:dd, borderColor:'#00e5b0', backgroundColor:gg, borderWidth:2, pointRadius:1.5, pointBackgroundColor:dd.map((v,i)=>i===0?'#3d9bff':dd[i]>=(dd[i-1]||0)?'#00e5b0':'#ff4d6a'), fill:true, tension:0.2 }] },
    options:{
      responsive:true, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{ ...CHART_DEFAULTS.tooltip, callbacks:{ label:c=>'Equity: $'+c.parsed.y.toLocaleString() } } },
      scales:{
        x:{ ticks:{ ...CHART_DEFAULTS.ticks, maxTicksLimit:12 }, grid:CHART_DEFAULTS.grid },
        y:{ ticks:{ ...CHART_DEFAULTS.ticks, callback:v=>'$'+v.toLocaleString() }, grid:CHART_DEFAULTS.grid },
      },
    },
  });
}

function buildDayOfWeek(trades) {
  dc('dow');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const wp = Array(7).fill(0), lp = Array(7).fill(0);
  trades.forEach(t => { const d = new Date(t.date+'T12:00:00').getDay(); t.pnl>0?wp[d]++:lp[d]++; });
  const ctx = document.getElementById('dowChart')?.getContext('2d');
  if(!ctx) return;

  charts['dow'] = new Chart(ctx, {
    type:'bar',
    data:{ labels:days, datasets:[
      { label:'Wins',   data:wp, backgroundColor:'rgba(0,229,176,0.7)', borderRadius:4 },
      { label:'Losses', data:lp, backgroundColor:'rgba(255,77,106,0.7)', borderRadius:4 },
    ]},
    options:{
      responsive:true,
      plugins:{ legend:{ labels:{ color:'rgba(232,234,240,0.8)', font:{size:9} } }, tooltip:CHART_DEFAULTS.tooltip },
      scales:{
        x:{ ticks:CHART_DEFAULTS.ticks, grid:{display:false} },
        y:{ ticks:CHART_DEFAULTS.ticks, grid:CHART_DEFAULTS.grid },
      },
    },
  });
}
