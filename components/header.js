// ============================================================
// HEADER COMPONENT
// ============================================================
import { state, switchAcct, fmtK, calcStats, allTrades } from '../js/app.js';

export function renderHeader() {
  const el = document.getElementById('appHeader');
  if(!el) return;

  el.innerHTML = `
    <div class="header-left">
      <div class="header-badge" id="headerBadge">Dashboard</div>
      <h1 class="header-title">Trading <span>Journal</span></h1>
      <div class="header-sub" id="headerSub">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold);margin-right:4px;"></span>
        Ready to connect
      </div>
    </div>
    <div class="header-right">
      <div class="bal-chip">
        <div class="bal-label">BALANCE</div>
        <div class="bal-value" id="headerBal">—</div>
      </div>
      <span class="import-badge" id="importBadge" style="display:none;cursor:pointer;background:rgba(61,155,255,0.1);border:1px solid rgba(61,155,255,0.25);border-radius:5px;padding:4px 10px;font-size:9px;color:var(--blue);letter-spacing:1px;"
        onclick="window.app.showImportPanel()">
        <span id="importBadgeText">MT5 Import</span>
      </span>
      <button class="btn btn-sm btn-gold" id="mfxSyncBtn" style="display:none" onclick="window.myfxbookAPI.syncNow()">Sync</button>
      <button class="btn btn-sm btn-blue" onclick="window.app.openHelp()">? Help</button>
      <button class="btn btn-sm btn-red"  onclick="window.derivAPI.disconnect()">Disconnect</button>
    </div>
  `;

  // Connection bar (inserted after header by CSS sticky)
  const connBar = document.getElementById('connBar');
  if(!connBar) {
    const bar = document.createElement('div');
    bar.id = 'connBar';
    bar.className = 'conn-bar offline';
    bar.textContent = '● Disconnected';
    el.insertAdjacentElement('afterend', bar);
  }

  updateImportBadge();
}

export function updateImportBadge() {
  const badge = document.getElementById('importBadge');
  const txt   = document.getElementById('importBadgeText');
  if(!badge || !txt) return;

  if(state.importedTrades.length > 0) {
    badge.style.display = 'inline-flex';
    const brokers = [...new Set(state.importedTrades.map(t => t.broker).filter(Boolean))];
    txt.textContent = brokers.join(' + ') + ' · ' + state.importedTrades.length + ' trades';
  } else {
    badge.style.display = 'none';
  }
}

export function renderAcctBar() {
  const bar = document.getElementById('acctBar');
  if(!bar) return;

  const raw = [
    ...state.liveTrades,
    ...state.importedTrades.filter(t => !state.liveTrades.find(x => x.id === t.id)),
  ];
  const pnlSum = trades => trades.reduce((s,t) => s+t.pnl, 0);
  const fmt    = n => fmtK(n);

  const brokers   = [...new Set(state.importedTrades.map(t => t.broker).filter(Boolean))];
  const derivLive = state.liveTrades.filter(t => t.src === 'live');
  const showLive  = derivLive.length > 0;

  const brokerColors = {
    'FTMO':       'var(--gold)',
    'The5ers':    'var(--purple)',
    'Deriv Real': 'var(--green)',
    'Deriv Demo': 'var(--cyan)',
  };

  const acctBtn = (id, cls, color, label, pnl, isActive) => `
    <button class="acct-btn ${cls} ${isActive ? 'active' : ''}"
      data-acct="${id}"
      style="${isActive
        ? `background:${color};border-color:${color};color:#000;`
        : `border-color:${color}40;color:${color};`}">
      <span class="acct-dot" style="background:${color}"></span>
      ${label}
      ${pnl !== null ? `<span class="acct-pnl">${fmt(pnl)}</span>` : ''}
    </button>`;

  const allPnl = pnlSum(raw);

  let html = `<span class="acct-label">Account:</span>`;

  // ALL
  html += acctBtn('all', 'all', 'var(--text)',
    'All', raw.length ? allPnl : null, state.activeAcct === 'all');

  // Deriv historical
  const derivTrades = raw.filter(t => t.src === 'hist' || t.src === 'live');
  if(derivTrades.length || state.derivConnected) {
    html += `<div class="acct-divider"></div>`;
    html += acctBtn('hist', 'deriv', 'var(--green)',
      'Deriv', derivTrades.length ? pnlSum(derivTrades) : null, state.activeAcct === 'hist');
  }

  // Deriv live (separate tab if connected)
  if(showLive) {
    html += acctBtn('live', 'deriv', 'var(--green)',
      `Live (${state.derivAcct.login || 'Deriv'})`,
      pnlSum(derivLive), state.activeAcct === 'live');
  }

  // Imported brokers
  if(brokers.length) {
    html += `<div class="acct-divider"></div>`;
    brokers.forEach(b => {
      const bTrades  = state.importedTrades.filter(t => t.broker === b);
      const col      = brokerColors[b] || 'var(--blue)';
      html += acctBtn(b, '', col, b,
        bTrades.length ? pnlSum(bTrades) : null, state.activeAcct === b);
    });
  }

  bar.innerHTML = html;

  // Bind click
  bar.querySelectorAll('.acct-btn').forEach(btn => {
    btn.addEventListener('click', () => switchAcct(btn.dataset.acct));
  });
}
