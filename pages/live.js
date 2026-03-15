// ============================================================
// LIVE PAGE
// ============================================================
import { state, fmtMoney } from '../js/app.js';

export function renderLive(container) {
  container.innerHTML = `
    <div id="mfxPanelWrap"></div>
    <div class="open-card">
      <div class="section-title"><span class="ldot"></span>Deriv Open Positions <span id="opCnt" style="color:var(--green)"></span></div>
      <div id="openPosList"><div class="empty">No open positions</div></div>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <div class="section-title" style="color:var(--muted)"><span class="ldot"></span>Recently Closed (Deriv)</div>
      <div class="feed-scroll" id="liveFeed"><div style="font-size:10px;color:var(--muted);text-align:center;padding:12px;">Waiting for trades...</div></div>
    </div>
    <div class="kpi-grid" id="todayKpis"></div>
  `;

  window.myfxbookAPI.renderPanel(document.getElementById('mfxPanelWrap'));
  renderOpenPositions();
  renderTodayKPIs();
}

export function renderOpenPositions() {
  const el  = document.getElementById('openPosList');
  const cnt = document.getElementById('opCnt');
  const pos = state.openPos || [];
  if(cnt) cnt.textContent = pos.length ? `(${pos.length})` : '';
  if(!el) return;
  if(!pos.length) { el.innerHTML = '<div class="empty">No open positions</div>'; return; }
  el.innerHTML = pos.map(p => `
    <div class="op-item">
      <div>
        <div style="font-weight:600">${p.name}</div>
        <div style="font-size:10px;color:var(--muted)">${p.type} · ${p.dt}</div>
      </div>
      <div style="text-align:right">
        <div class="${p.pnl>=0?'pp':'pn'}" style="font-family:'Syne',sans-serif;font-weight:700;">${p.pnl>=0?'+':''}$${Math.abs(p.pnl).toFixed(2)}</div>
        <div style="font-size:10px;color:var(--muted)">Cost: $${p.bp.toFixed(2)}</div>
      </div>
    </div>`).join('');
}

export function addFeedItem(tx) {
  const feed = document.getElementById('liveFeed');
  if(!feed) return;
  const pnl = parseFloat(tx.amount || 0);
  const el  = document.createElement('div');
  el.className = 'feed-item';
  el.innerHTML = `
    <span>${tx.display_name || 'Trade'}</span>
    <span class="feed-pill ${pnl>=0?'win':'loss'}">${pnl>=0?'WIN':'LOSS'}</span>
    <span class="${pnl>=0?'pp':'pn'}">${pnl>=0?'+':''}$${Math.abs(pnl).toFixed(2)}</span>
  `;
  feed.insertBefore(el, feed.firstChild);
  if(feed.children.length > 20) feed.removeChild(feed.lastChild);
}

function renderTodayKPIs() {
  const el = document.getElementById('todayKpis');
  if(!el) return;
  const today  = new Date().toISOString().slice(0,10);
  const trades = [...(state.liveTrades||[]), ...(state.importedTrades||[])].filter(t => t.date === today);
  const w = trades.filter(t=>t.pnl>0);
  const l = trades.filter(t=>t.pnl<0);
  const tot = trades.reduce((s,t)=>s+t.pnl,0);
  const best = w.length ? Math.max(...w.map(t=>t.pnl)) : 0;
  const wr = trades.length ? (w.length/trades.length*100) : 0;

  el.innerHTML = [
    { l:"Today's P/L",    v: (tot>=0?'+$':'-$')+Math.abs(tot).toFixed(0), c: tot>=0?'g':'r', sub: today },
    { l:"Today's Trades", v: trades.length, c: 'b', sub: `${w.length}W · ${l.length}L` },
    { l:"Today's Win%",   v: wr.toFixed(0)+'%', c: wr>=40?'g':'r', sub: 'Today only' },
    { l:"Best Today",     v: '+$'+best.toFixed(0), c: 'g', sub: 'Biggest win today' },
  ].map(k => `
    <div class="kpi-card ${k.c}">
      <div class="kpi-label">${k.l}</div>
      <div class="kpi-value ${k.c}">${k.v}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');
}
