// ============================================================
// HISTORY PAGE — trade table with filters
// ============================================================
import { state, allTrades, fmtMoney, showModal } from '../js/app.js';

let sortCol = 'date';
let sortDir = 'desc';

export function renderHistory(container) {
  container.innerHTML = `
    <div class="range-btns" id="rangeBtns">
      <button class="rbtn active" data-range="all">All</button>
      <button class="rbtn" data-range="today">Today</button>
      <button class="rbtn" data-range="week">This Week</button>
      <button class="rbtn" data-range="month">This Month</button>
      <button class="rbtn" data-range="3month">Last 3 Months</button>
      <button class="rbtn" data-range="year">This Year</button>
    </div>
    <div class="filter-btns" id="filterBtns">
      <button class="rbtn active" data-filter="all">All</button>
      <button class="rbtn" data-filter="win">Wins</button>
      <button class="rbtn" data-filter="loss">Losses</button>
      <button class="rbtn" data-filter="V10">V10</button>
      <button class="rbtn" data-filter="V25">V25</button>
      <button class="rbtn" data-filter="V50">V50</button>
      <button class="rbtn" data-filter="V75">V75</button>
      <button class="rbtn" data-filter="V100">V100</button>
      <button class="rbtn" data-filter="BUY">Buy</button>
      <button class="rbtn" data-filter="SELL">Sell</button>
      <input type="text" class="search-box" id="tradeSearch" placeholder="Search instrument...">
    </div>
    <div class="tbl-card">
      <div class="tbl-header">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div class="tbl-title">Closed Trades</div>
          <div id="acctFilterLabel" style="font-size:9px;padding:2px 8px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);"></div>
        </div>
        <div class="tbl-count" id="tblCount"></div>
      </div>
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th data-col="instrument">Instrument</th>
              <th data-col="direction">Dir</th>
              <th data-col="lots">Lots</th>
              <th data-col="open">Open</th>
              <th data-col="close">Close</th>
              <th data-col="date">Date</th>
              <th data-col="pnl">P/L</th>
              <th>Journal</th>
            </tr>
          </thead>
          <tbody id="tradeBody"></tbody>
        </table>
      </div>
    </div>
  `;

  // Bind range buttons
  document.getElementById('rangeBtns').addEventListener('click', e => {
    const btn = e.target.closest('.rbtn');
    if(!btn) return;
    document.querySelectorAll('#rangeBtns .rbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.range = btn.dataset.range;
    renderTable();
  });

  // Bind filter buttons
  document.getElementById('filterBtns').addEventListener('click', e => {
    const btn = e.target.closest('.rbtn');
    if(!btn) return;
    document.querySelectorAll('#filterBtns .rbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    renderTable();
  });

  // Bind search
  document.getElementById('tradeSearch').addEventListener('input', renderTable);

  // Bind column sort
  document.querySelector('thead').addEventListener('click', e => {
    const th = e.target.closest('th[data-col]');
    if(!th) return;
    const col = th.dataset.col;
    if(sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = col; sortDir = 'desc'; }
    // Update header indicators
    document.querySelectorAll('thead th').forEach(h => h.classList.remove('sa','sd'));
    th.classList.add(sortDir === 'asc' ? 'sa' : 'sd');
    renderTable();
  });

  // Restore active filters
  const activeRange  = document.querySelector(`#rangeBtns [data-range="${state.range}"]`);
  const activeFilter = document.querySelector(`#filterBtns [data-filter="${state.filter}"]`);
  if(activeRange)  { document.querySelectorAll('#rangeBtns .rbtn').forEach(b=>b.classList.remove('active')); activeRange.classList.add('active'); }
  if(activeFilter) { document.querySelectorAll('#filterBtns .rbtn').forEach(b=>b.classList.remove('active')); activeFilter.classList.add('active'); }

  renderTable();
}

function applyRange(trades) {
  const now   = new Date();
  const today = now.toISOString().slice(0,10);
  const week  = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const m3    = new Date(now.getFullYear(), now.getMonth()-3, 1).toISOString().slice(0,10);
  const year  = new Date(now.getFullYear(), 0, 1).toISOString().slice(0,10);

  switch(state.range) {
    case 'today':  return trades.filter(t => t.date === today);
    case 'week':   return trades.filter(t => t.date >= week);
    case 'month':  return trades.filter(t => t.date >= month);
    case '3month': return trades.filter(t => t.date >= m3);
    case 'year':   return trades.filter(t => t.date >= year);
    default:       return trades;
  }
}

function applyFilter(trades) {
  const f = state.filter;
  switch(f) {
    case 'win':  return trades.filter(t => t.pnl > 0);
    case 'loss': return trades.filter(t => t.pnl < 0);
    case 'BUY':  return trades.filter(t => t.direction === 'BUY');
    case 'SELL': return trades.filter(t => t.direction === 'SELL');
    case 'all':  return trades;
    default:     return trades.filter(t => t.idx === f);
  }
}

function renderTable() {
  const q = (document.getElementById('tradeSearch')?.value || '').toLowerCase();

  let trades = allTrades();
  trades = applyRange(trades);
  trades = applyFilter(trades);
  if(q) trades = trades.filter(t =>
    t.instrument.toLowerCase().includes(q) || t.idx.toLowerCase().includes(q)
  );

  // Sort
  trades = [...trades].sort((a,b) => {
    let va = a[sortCol], vb = b[sortCol];
    if(typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    return sortDir === 'asc' ? (va>vb?1:-1) : (va<vb?1:-1);
  });

  // Update count
  const total = trades.reduce((s,t) => s+t.pnl, 0);
  const cnt = document.getElementById('tblCount');
  if(cnt) cnt.textContent = `${trades.length} trades · ${fmtMoney(total,0)} P/L`;

  // Update account label
  const lbl = document.getElementById('acctFilterLabel');
  if(lbl) {
    const labels = { all:'All Accounts', hist:'Deriv', live:'Deriv Live' };
    lbl.textContent = labels[state.activeAcct] || state.activeAcct;
  }

  const tbody = document.getElementById('tradeBody');
  if(!tbody) return;

  if(!trades.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty">
      ${!state.importedTrades.length && !state.liveTrades.length
        ? '📂 No trades yet — connect your Deriv API or import an MT5 file'
        : 'No trades match the current filter'}
    </div></td></tr>`;
    return;
  }

  const hasJournal = id => state.journalEntries.some(j => j.tradeId === id);

  tbody.innerHTML = trades.map(t => {
    const brokerTag = t.broker
      ? `<span class="broker-tag ${t.broker==='FTMO'?'ftmo':t.broker==='The5ers'?'five':'deriv'}">${t.broker}</span>`
      : '';
    const liveTag = t.src === 'live' ? `<span class="broker-tag live">LIVE</span>` : '';
    const jLink = hasJournal(t.id)
      ? `<span style="cursor:pointer;color:var(--purple);font-size:10px;" data-jopen="${t.id}"> View</span>`
      : `<span style="cursor:pointer;color:var(--muted);font-size:10px;" data-jopen="${t.id}">+ Log</span>`;

    return `<tr class="${t.pnl>0?'win':'loss'}" data-trade="${t.id}">
      <td>${t.instrument}${liveTag}${brokerTag}</td>
      <td><span class="pill pill-${t.direction==='BUY'?'buy':'sell'}">${t.direction}</span></td>
      <td>${t.lots}</td>
      <td>${t.open ? t.open.toLocaleString() : '—'}</td>
      <td>${t.close ? t.close.toLocaleString() : '—'}</td>
      <td>${t.date.slice(5).replace('-','/')}</td>
      <td class="${t.pnl>0?'pp':'pn'}">${t.pnl>0?'+':''}$${Math.abs(t.pnl).toFixed(2)}</td>
      <td>${jLink}</td>
    </tr>`;
  }).join('');

  // Bind row clicks
  tbody.querySelectorAll('tr[data-trade]').forEach(row => {
    row.addEventListener('click', e => {
      if(e.target.dataset.jopen) {
        openJournalForTrade(e.target.dataset.jopen);
      } else {
        openTradeModal(row.dataset.trade);
      }
    });
  });
}

function openTradeModal(id) {
  const t = allTrades().find(x => x.id === id);
  if(!t) return;
  const j = state.journalEntries.find(x => x.tradeId === id);

  showModal(`
    <h2>${t.instrument} · ${t.direction}</h2>
    <div class="modal-row"><span class="modal-label">Date</span><span class="modal-value">${t.date}</span></div>
    <div class="modal-row"><span class="modal-label">Direction</span><span class="modal-value" style="color:${t.direction==='BUY'?'var(--blue)':'var(--red)'}">${t.direction}</span></div>
    <div class="modal-row"><span class="modal-label">Lots/Stake</span><span class="modal-value">${t.lots}</span></div>
    <div class="modal-row"><span class="modal-label">Open</span><span class="modal-value">${t.open ? t.open.toLocaleString() : '—'}</span></div>
    <div class="modal-row"><span class="modal-label">Close</span><span class="modal-value">${t.close ? t.close.toLocaleString() : '—'}</span></div>
    <div class="modal-row"><span class="modal-label">P/L</span><span class="modal-value" style="color:${t.pnl>0?'var(--green)':'var(--red)'}">${t.pnl>0?'+':''}$${Math.abs(t.pnl).toFixed(2)}</span></div>
    <div class="modal-row"><span class="modal-label">Result</span><span class="modal-value" style="color:${t.pnl>0?'var(--green)':'var(--red)'}">${t.pnl>0?'✅ WIN':'❌ LOSS'}</span></div>
    ${j ? `<div style="margin-top:12px;padding:10px;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.15);border-radius:8px;font-size:11px;">
      <div style="color:var(--purple);font-weight:600;margin-bottom:5px;">Journal Note</div>
      <div style="color:var(--muted);">${j.reflection || j.setup || '(saved)'}</div>
    </div>` : ''}
    <div style="margin-top:14px;">
      <button class="btn btn-purple btn-sm" onclick="window.app.closeModal();openJournalForTrade('${t.id}')">
        ${j ? 'Edit Journal Entry' : '+ Add Journal Entry'}
      </button>
    </div>
  `);
}

function openJournalForTrade(tradeId) {
  window.app.navigate('journal');
  // Small delay to let journal page render
  setTimeout(() => {
    import('./journal.js').then(m => m.openJournalForm?.(tradeId));
  }, 100);
}

// Export for other modules
export { openJournalForTrade };
