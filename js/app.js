// ============================================================
// TRADING JOURNAL v2 — Main App
// ============================================================

import { DerivAPI }    from './deriv.js';
import { MyfxbookAPI } from './myfxbook.js';
import { Importer }    from './importer.js';

// Initialize API instances immediately when module loads
// This ensures window.derivAPI is available when buttons are clicked
window.derivAPI    = null;
window.myfxbookAPI = null;
window.importer    = null;
import { renderHeader, renderAcctBar } from '../components/header.js';
import { renderOverview }  from '../pages/overview.js';
import { renderLive }      from '../pages/live.js';
import { renderHistory }   from '../pages/history.js';
import { renderJournal }   from '../pages/journal.js';
import { renderCharts }    from '../pages/charts.js';
import { renderCalendar }  from '../pages/calendar.js';

// ============================================================
// STATE — single source of truth
// ============================================================
export const state = {
  // Trades
  liveTrades:     [],   // from Deriv API
  importedTrades: [],   // from MT5 file imports / Myfxbook
  journalEntries: [],
  importHistory:  [],

  // UI state
  activeAcct:  'all',   // 'all' | 'hist' | 'live' | broker name
  currentPage: 'overview',
  lbImages:    [],
  lbIndex:     0,

  // Connection
  derivConnected: false,
  derivAcct:      {},
  mfxConnected:   false,
  mfxAccounts:    [],

  // Filters (shared across pages)
  range:  'all',
  filter: 'all',
  sortCol: 'date',
  sortDir: 'desc',
};

// ============================================================
// COMPUTED — derived data
// ============================================================
export function allTrades() {
  const liveIds = new Set(state.liveTrades.map(t => t.id));
  const impIds  = new Set(state.importedTrades.map(t => t.id));
  const allIds  = new Set([...liveIds, ...impIds]);

  const combined = [
    ...state.liveTrades,
    ...state.importedTrades.filter(t => !liveIds.has(t.id)),
  ].sort((a,b) => b.date.localeCompare(a.date));

  // Filter by active account
  switch(state.activeAcct) {
    case 'all':  return combined;
    case 'hist': return combined.filter(t => t.src === 'hist' || t.src === 'live');
    case 'live': return combined.filter(t => t.src === 'live');
    default:     return combined.filter(t => t.broker === state.activeAcct);
  }
}

export function calcStats(trades) {
  const w   = trades.filter(t => t.pnl > 0);
  const l   = trades.filter(t => t.pnl < 0);
  const tot = trades.reduce((s,t) => s + t.pnl, 0);
  const gw  = w.reduce((s,t) => s + t.pnl, 0);
  const gl  = Math.abs(l.reduce((s,t) => s + t.pnl, 0));
  const aw  = w.length ? gw / w.length : 0;
  const al  = l.length ? gl / l.length : 0;
  return {
    tot, w: w.length, l: l.length, n: trades.length,
    gw, gl, aw, al,
    pf:  gl > 0 ? gw / gl : w.length ? 99 : 0,
    rrr: al > 0 ? aw / al : 0,
    wr:  trades.length ? (w.length / trades.length) * 100 : 0,
    exp: trades.length ? tot / trades.length : 0,
    best:  w.length ? Math.max(...w.map(t => t.pnl)) : 0,
    worst: l.length ? Math.min(...l.map(t => t.pnl)) : 0,
  };
}

export function fmtMoney(n, d=2) {
  return n >= 0
    ? `+$${Math.abs(n).toFixed(d)}`
    : `-$${Math.abs(n).toFixed(d)}`;
}

export function fmtK(n) {
  const abs = Math.abs(n);
  const val = abs >= 1000 ? (abs/1000).toFixed(1)+'K' : abs.toFixed(0);
  return (n >= 0 ? '+$' : '-$') + val;
}

export function getStartingBalance() {
  const acct = state.activeAcct;
  if(acct !== 'all' && acct !== 'hist' && acct !== 'live') {
    const trades = state.importedTrades.filter(t => t.broker === acct);
    const withBal = trades.find(t => t.accountBalance > 0);
    if(withBal) {
      const totalPnl = trades.reduce((s,t) => s + t.pnl, 0);
      return parseFloat((withBal.accountBalance - totalPnl).toFixed(2));
    }
    return 5000;
  }
  if(acct === 'live' || state.liveTrades.length) {
    const bal = parseFloat(
      document.querySelector('.bal-value')?.textContent?.replace(/[^0-9.]/g,'') || '0'
    );
    const totalPnl = state.liveTrades.reduce((s,t) => s + t.pnl, 0);
    return bal > 0 ? parseFloat((bal - totalPnl).toFixed(2)) : 10000;
  }
  return 10000;
}

// ============================================================
// PERSISTENCE
// ============================================================
export function saveState() {
  localStorage.setItem('importedTrades',  JSON.stringify(state.importedTrades));
  localStorage.setItem('journalEntries',  JSON.stringify(state.journalEntries));
  localStorage.setItem('importHistory',   JSON.stringify(state.importHistory));
}

export function loadState() {
  state.importedTrades = JSON.parse(localStorage.getItem('importedTrades') || '[]');
  state.journalEntries = JSON.parse(localStorage.getItem('journalEntries') || '[]');
  state.importHistory  = JSON.parse(localStorage.getItem('importHistory')  || '[]');
}

// ============================================================
// ROUTER
// ============================================================
const pages = {
  overview: renderOverview,
  live:     renderLive,
  history:  renderHistory,
  journal:  renderJournal,
  charts:   renderCharts,
  calendar: renderCalendar,
};

export function navigate(page) {
  if(!pages[page]) return;
  state.currentPage = page;

  // Update nav tabs
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === page);
  });

  // Render page
  const container = document.getElementById('pageContainer');
  container.innerHTML = '';
  container.classList.add('fade-in');
  pages[page](container);
  setTimeout(() => container.classList.remove('fade-in'), 300);
}

// ============================================================
// ACCOUNT SWITCHER
// ============================================================
export function switchAcct(acct) {
  state.activeAcct = acct;
  renderAcctBar();
  refresh();
}

// ============================================================
// REFRESH — re-renders current page + header
// ============================================================
export function refresh() {
  renderAcctBar();
  navigate(state.currentPage);
}

// ============================================================
// LOGIN
// ============================================================
export function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

export function skipLogin() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderHeader();
  renderAcctBar();
  navigate('overview');

  // Auto-restore Myfxbook if session saved
  window.myfxbookAPI?.autoRestore?.();
}

// ============================================================
// IMPORT PANEL
// ============================================================
export function showImportPanel() {
  const panel   = document.getElementById('importPanel');
  const overlay = document.getElementById('importOverlay');
  panel.classList.remove('hidden');
  panel.classList.add('visible');
  overlay.classList.remove('hidden');
  panel.innerHTML = window.importer.renderPanel();
  window.importer.bindPanel();
}

export function hideImportPanel() {
  document.getElementById('importPanel').classList.add('hidden');
  document.getElementById('importPanel').classList.remove('visible');
  document.getElementById('importOverlay').classList.add('hidden');
}

// ============================================================
// HELP
// ============================================================
export function openHelp() {
  import('../components/help.js').then(m => {
    if(m && m.renderHelp) m.renderHelp();
    else console.error('Help module not found');
  }).catch(e => console.error('Help load error:', e));
}
export function closeHelp() {
  document.getElementById('helpDrawer').classList.add('hidden');
  document.getElementById('helpOverlay').classList.add('hidden');
}

// ============================================================
// LIGHTBOX
// ============================================================
export function openLightbox(images, idx=0) {
  state.lbImages = images;
  state.lbIndex  = idx;
  showLightboxAt(idx);
}

function showLightboxAt(idx) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lbImg');
  const cap = document.getElementById('lbCaption');
  lb.classList.remove('hidden');
  img.src = state.lbImages[idx].src;
  cap.textContent = `${idx+1} / ${state.lbImages.length}${state.lbImages[idx].caption ? ' · '+state.lbImages[idx].caption : ''}`;
  document.querySelector('.lightbox-nav.prev').style.display = state.lbImages.length > 1 ? 'block' : 'none';
  document.querySelector('.lightbox-nav.next').style.display = state.lbImages.length > 1 ? 'block' : 'none';
}

export function lbNav(dir) {
  state.lbIndex = (state.lbIndex + dir + state.lbImages.length) % state.lbImages.length;
  showLightboxAt(state.lbIndex);
}

export function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
}

// ============================================================
// MODAL HELPER
// ============================================================
export function showModal(html) {
  const container = document.getElementById('modals');
  container.innerHTML = `
    <div class="modal-overlay" id="activeModal">
      <div class="modal">
        <button class="modal-close" onclick="window.app.closeModal()">✕</button>
        ${html}
      </div>
    </div>
  `;
  document.getElementById('activeModal').addEventListener('click', e => {
    if(e.target.id === 'activeModal') closeModal();
  });
}

export function closeModal() {
  document.getElementById('modals').innerHTML = '';
}

// ============================================================
// BOOTSTRAP
// ============================================================
async function boot() {
  // Load persisted state
  loadState();

  // Init modules — attach to window for cross-module access
  window.app = { navigate, switchAcct, refresh, skipLogin, showLogin,
                  showImportPanel, hideImportPanel, openHelp, closeHelp,
                  openLightbox, lbNav, closeLightbox, showModal, closeModal };
  window.derivAPI    = new DerivAPI();
  window.myfxbookAPI = new MyfxbookAPI();
  window.importer    = new Importer();
  console.log('✅ Trading Journal v2 loaded successfully');

  // Bind login screen tabs
  document.querySelectorAll('.login-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.login-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.login-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    });
  });

  // Bind broker buttons on login
  document.querySelectorAll('.broker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.broker-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.importer.selectedBroker = btn.dataset.broker;
    });
  });

  // Bind login file input — supports multiple files
  const loginFile = document.getElementById('loginFileInput');
  if(loginFile) {
    loginFile.addEventListener('change', e => {
      window.importer.handleMultipleFiles(e.target.files, 'loginImportStatus', true);
    });
  }
  const loginZone = document.getElementById('loginDropZone');
  if(loginZone) {
    loginZone.addEventListener('dragover', e => { e.preventDefault(); loginZone.classList.add('dragover'); });
    loginZone.addEventListener('dragleave', () => loginZone.classList.remove('dragover'));
    loginZone.addEventListener('drop', e => {
      e.preventDefault();
      loginZone.classList.remove('dragover');
      window.importer.handleMultipleFiles(e.dataTransfer.files, 'loginImportStatus', true);
    });
  }

  // Bind nav tabs
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape') {
      closeLightbox();
      closeModal();
      closeHelp();
    }
    if(e.key === 'ArrowLeft'  && !document.getElementById('lightbox').classList.contains('hidden')) lbNav(-1);
    if(e.key === 'ArrowRight' && !document.getElementById('lightbox').classList.contains('hidden')) lbNav(1);
  });

  // Auto-enter if trades already imported
  if(state.importedTrades.length > 0) {
    skipLogin();
  }
  // Otherwise show login screen (already visible by default)
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', boot);
