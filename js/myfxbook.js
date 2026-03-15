// ============================================================
// MYFXBOOK SYNC MODULE — Fixed for public accounts
// ============================================================
import { state, saveState, refresh } from './app.js';
import { parseDate, symToIdx, symToName } from './utils.js';
import { updateImportBadge } from '../components/header.js';

const MFX_PROXY = 'https://scintillating-zuccutto-9bf82f.netlify.app/.netlify/functions/mfxapi';
const MFX_KNOWN = [
  { id:'11593082', broker:'FTMO',       name:'FTMO Demo' },
  { id:'11970519', broker:'FTMO',       name:'FTMO DEMO2' },
  { id:'11970510', broker:'The5ers',    name:'The5ers' },
  { id:'11970633', broker:'Deriv Real', name:'Deriv MT5 Real' },
  { id:'11970638', broker:'Deriv Demo', name:'Deriv MT5 Demo' },
];

export class MyfxbookAPI {
  constructor() {
    this.email    = localStorage.getItem('mfxEmail')   || '';
    this.accounts = JSON.parse(localStorage.getItem('mfxAccounts') || '[]');
    this.syncing  = false;
    this.timer    = null;
  }

  async connect() {
    const email = document.getElementById('mfxEmailInput')?.value?.trim();
    const pass  = document.getElementById('mfxPassInput')?.value?.trim();
    if(!email || !pass) { this._setStatus('Please enter email and password', 'err'); return; }

    const btn = document.getElementById('mfxConnectBtn');
    if(btn) { btn.disabled=true; btn.textContent='Connecting...'; }
    this._setStatus('Connecting to Myfxbook...', 'info');

    try {
      // Login and get accounts in one call
      const data = await this._call('loginandaccounts', { email, password: pass });
      if(!data.session) throw new Error(data.message || 'Login failed — check email/password');

      this.email = email;
      localStorage.setItem('mfxEmail', email);
      localStorage.setItem('mfxPass',  pass);
      // Save session for auto-restore
      localStorage.setItem('mfxSession', data.session);

      console.log('Myfxbook login OK | accounts from API:', data.accounts?.length);

      // Use API accounts if available, otherwise use known list
      if(data.accounts?.length) {
        this.accounts = data.accounts;
        console.log('Account balances from API:', data.accounts.map(a => `${a.name}: $${a.balance}`));
      } else {
        console.log('No accounts from API — using pre-configured list');
        this.accounts = MFX_KNOWN.map(k => ({
          id: k.id, name: k.name, broker: k.broker,
          balance: 0, equity: 0, profit: 0, gain: 0,
        }));
      }
      localStorage.setItem('mfxAccounts', JSON.stringify(this.accounts));

      this._showConnected(true);
      this._setDot('connected');
      this._setStatus('Connected! Syncing trade history...', 'ok');
      this._renderAccounts();

      await this._doSync(pass);
      this.timer = setInterval(() => this._doSync(localStorage.getItem('mfxPass')||''), 10*60*1000);

    } catch(err) {
      console.error('Myfxbook connect error:', err);
      this._setStatus('Error: ' + err.message, 'err');
      if(btn) { btn.disabled=false; btn.textContent='Connect to Myfxbook'; }
    }
  }

  async syncNow() {
    const pass = localStorage.getItem('mfxPass') || '';
    if(!pass) { this._setStatus('Please reconnect — credentials missing', 'err'); return; }
    await this._doSync(pass);
  }

  async _doSync(pass) {
    if(this.syncing) return;
    this.syncing = true;
    this._setDot('syncing');

    const syncBtn = document.getElementById('mfxSyncBtn');
    if(syncBtn) { syncBtn.textContent = 'Syncing...'; }

    const email = localStorage.getItem('mfxEmail') || this.email;

    try {
      this._setStatus('Syncing all accounts...', 'info');

      // Single server-side call: login + get accounts + get all history
      const res = await this._call('syncall', {
        email,
        password: pass,
        ids: MFX_KNOWN.map(k => k.id).join(','),
      });

      console.log('Syncall response:', {
        error: res.error,
        accountsFound: res.accountsFound,
        totalTrades: res.totalTrades,
        accounts: res.accounts?.map(a => `${a.name||a.id}: bal=$${a.balance} profit=$${a.profit}`),
      });

      if(res.error) throw new Error(res.message || 'Sync failed');

      // Update account balances from fresh data
      if(res.accounts?.length) {
        res.accounts.forEach(a => {
          const local = this.accounts.find(x => String(x.id) === String(a.id));
          if(local) {
            local.balance = parseFloat(a.balance || 0);
            local.equity  = parseFloat(a.equity  || 0);
            local.profit  = parseFloat(a.profit  || 0);
            local.gain    = parseFloat(a.gain    || 0);
            local.name    = a.name || local.name;
          } else {
            // New account found
            const known = MFX_KNOWN.find(k => String(k.id) === String(a.id));
            this.accounts.push({
              id:      a.id,
              name:    a.name || (known?.name || 'Account '+a.id),
              broker:  known?.broker || a.broker || 'MT5',
              balance: parseFloat(a.balance || 0),
              equity:  parseFloat(a.equity  || 0),
              profit:  parseFloat(a.profit  || 0),
              gain:    parseFloat(a.gain    || 0),
            });
          }
        });
        localStorage.setItem('mfxAccounts', JSON.stringify(this.accounts));
        this._renderAccounts();
      }

      // Add trades
      let added = 0;
      if(res.trades?.length) {
        console.log(`Processing ${res.trades.length} trades from Myfxbook...`);
        const existingIds = new Set(state.importedTrades.map(t => t.id));
        res.trades.forEach(item => {
          const known  = MFX_KNOWN.find(k => k.id === String(item.accountId));
          const broker = known?.broker || 'MT5';
          const acc    = this.accounts.find(a => String(a.id) === String(item.accountId)) || {};
          const trade  = this._tradeToLocal(item.trade, broker, acc);
          if(trade && !existingIds.has(trade.id)) {
            state.importedTrades.push(trade);
            existingIds.add(trade.id);
            added++;
          }
        });
        if(added > 0) saveState();
      }

      const now = new Date().toLocaleTimeString();
      const el  = document.getElementById('mfxLastSync');
      if(el) el.textContent = `Last synced: ${now} · ${added} new trades`;

      const msg = res.totalTrades === 0
        ? 'Synced — accounts are public but no trade history found yet. Make sure MT5 is connected to Myfxbook.'
        : added > 0
          ? `✅ Synced · ${added} new trades added`
          : `✅ Up to date · ${state.importedTrades.filter(t=>t.source==='myfxbook').length} trades loaded`;

      this._setStatus(msg, res.totalTrades === 0 ? 'info' : 'ok');
      this._setDot('connected');
      updateImportBadge();
      if(added > 0) refresh();

    } catch(err) {
      console.error('Myfxbook sync error:', err);
      this._setStatus('Sync error: ' + err.message, 'err');
      this._setDot('error');
    }

    this.syncing = false;
    if(syncBtn) syncBtn.textContent = 'Sync Now';
  }

  disconnect() {
    if(!confirm('Disconnect Myfxbook? Your imported trades will remain.')) return;
    if(this.timer) clearInterval(this.timer);
    this.accounts = [];
    localStorage.removeItem('mfxSession');
    localStorage.removeItem('mfxAccounts');
    localStorage.removeItem('mfxPass');
    this._showConnected(false);
    this._setDot('');
    this._setStatus('', '');
    const syncBtn = document.getElementById('mfxSyncBtn');
    if(syncBtn) syncBtn.style.display = 'none';
  }

  async autoRestore() {
    const session = localStorage.getItem('mfxSession');
    const pass    = localStorage.getItem('mfxPass');
    if(!session || !pass) return;

    this.email = localStorage.getItem('mfxEmail') || '';

    // Restore cached accounts
    const cached = JSON.parse(localStorage.getItem('mfxAccounts') || '[]');
    this.accounts = cached.length
      ? cached
      : MFX_KNOWN.map(k => ({ id:k.id, name:k.name, broker:k.broker, balance:0, profit:0, gain:0 }));

    this._showConnected(true);
    this._setDot('connected');
    this._renderAccounts();
    this._setStatus('Session restored. Syncing...', 'ok');

    await this._doSync(pass);
    this.timer = setInterval(() => this._doSync(pass), 10*60*1000);
  }

  renderPanel(container) {
    if(!container) return;
    const isConnected = !!localStorage.getItem('mfxSession');
    const savedEmail  = localStorage.getItem('mfxEmail') || '';
    const savedPass   = localStorage.getItem('mfxPass')  || '';

    container.innerHTML = `
      <div class="mfx-panel">
        <div class="mfx-title">
          Myfxbook Live Sync
          <div style="display:flex;align-items:center;gap:6px;font-size:10px;">
            <span class="mfx-dot ${isConnected?'connected':''}" id="mfxDot"></span>
            <span id="mfxStatusText" style="color:var(--muted)">${isConnected?'Connected · Auto-sync on':'Not connected'}</span>
          </div>
        </div>

        <div id="mfxLoginForm" ${isConnected?'style="display:none"':''}>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
            <div>
              <div class="form-label">Myfxbook Email</div>
              <input type="email" class="text-input sm" id="mfxEmailInput"
                placeholder="your@email.com" value="${savedEmail}">
            </div>
            <div>
              <div class="form-label">Password</div>
              <input type="password" class="text-input sm" id="mfxPassInput"
                placeholder="••••••••" value="${savedPass}">
            </div>
          </div>
          <button class="btn btn-gold btn-full" id="mfxConnectBtn"
            onclick="window.myfxbookAPI.connect()">
            Connect to Myfxbook
          </button>
        </div>

        <div class="status-bar" id="mfxStatusBar" style="display:none;margin-top:10px;"></div>

        <div id="mfxAccountsWrap" ${isConnected?'':'style="display:none"'}>
          <div id="mfxAccountsList"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
            <span id="mfxLastSync" style="font-size:9px;color:var(--muted)">Never synced</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm btn-gold"      onclick="window.myfxbookAPI.syncNow()">Sync Now</button>
              <button class="btn btn-sm btn-blue"      onclick="window.myfxbookAPI.autoRestore()">Reconnect</button>
              <button class="btn btn-sm btn-red"       onclick="window.myfxbookAPI.disconnect()">Disconnect</button>
            </div>
          </div>
        </div>
      </div>`;

    if(isConnected) {
      this._renderAccounts();
    }
  }

  _renderAccounts() {
    const el = document.getElementById('mfxAccountsList');
    if(!el) return;

    const colors = {
      'FTMO':       'var(--gold)',
      'The5ers':    'var(--purple)',
      'Deriv Real': 'var(--green)',
      'Deriv Demo': 'var(--cyan)',
    };

    const list = this.accounts.length ? this.accounts
      : MFX_KNOWN.map(k => ({ id:k.id, name:k.name, broker:k.broker, balance:0, profit:0, gain:0 }));

    el.innerHTML = list.map(acc => {
      const known  = MFX_KNOWN.find(k => String(k.id) === String(acc.id));
      const broker = known?.broker || acc.broker || 'MT5';
      const col    = colors[broker] || 'var(--blue)';
      const bal    = parseFloat(acc.balance || 0);
      const profit = parseFloat(acc.profit  || 0);
      const gain   = parseFloat(acc.gain    || 0);

      return `<div class="mfx-account-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <div class="mfx-account-name">${acc.name || broker}</div>
            <div style="font-size:9px;color:var(--muted)">ID: ${acc.id}</div>
          </div>
          <span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;
            background:${col}20;color:${col}">${broker}</span>
        </div>
        <div class="mfx-account-stats">
          <div class="mfx-stat">
            <div class="mfx-stat-v" style="color:${bal>0?'var(--green)':'var(--muted)'}">
              ${bal > 0 ? '$'+bal.toLocaleString() : '—'}
            </div>
            <div class="mfx-stat-l">Balance</div>
          </div>
          <div class="mfx-stat">
            <div class="mfx-stat-v" style="color:${profit>=0?'var(--green)':'var(--red)'}">
              ${profit !== 0 ? (profit>=0?'+':'')+profit.toFixed(2) : '—'}
            </div>
            <div class="mfx-stat-l">Profit</div>
          </div>
          <div class="mfx-stat">
            <div class="mfx-stat-v" style="color:${gain>=0?'var(--green)':'var(--red)'}">
              ${gain !== 0 ? (gain>=0?'+':'')+gain.toFixed(2)+'%' : '—'}
            </div>
            <div class="mfx-stat-l">Gain</div>
          </div>
        </div>
        ${bal === 0 ? `<div style="font-size:9px;color:var(--muted);margin-top:6px;
          padding:4px 8px;background:rgba(255,255,255,0.03);border-radius:5px;">
          Account must be verified &amp; public on Myfxbook to show balance
        </div>` : ''}
      </div>`;
    }).join('');
  }

  _tradeToLocal(t, broker, acc) {
    if(!t) return null;
    const openTime = t.openTime || t.open_time || '';
    if(!openTime) return null;
    const sym  = (t.symbol || '').toUpperCase();
    const type = (t.action || t.type || '').toLowerCase();
    const pnl  = parseFloat(t.profit||0) + parseFloat(t.commission||0) + parseFloat(t.swap||0);
    let lots   = 1;
    if(t.sizing?.value) lots = parseFloat(t.sizing.value);
    else if(t.lots)     lots = parseFloat(t.lots);
    const uid = t.openOrderId || t.id || (sym + openTime);
    return {
      id:             'mfx_'+uid+'_'+broker,
      instrument:     symToName(sym),
      idx:            symToIdx(sym),
      symbol:         sym,
      direction:      type.includes('buy') ? 'BUY' : 'SELL',
      lots,
      open:           parseFloat(t.openPrice  || 0),
      close:          parseFloat(t.closePrice || 0),
      date:           parseDate(t.closeTime || openTime),
      pnl:            parseFloat(pnl.toFixed(2)),
      src:            'import',
      broker,
      accountBalance: parseFloat(acc.balance || 0),
      source:         'myfxbook',
    };
  }

  async _call(action, params={}) {
    const qs  = Object.entries({ action, ...params })
      .map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const url = MFX_PROXY + '?' + qs;
    const res = await fetch(url, { method:'GET', mode:'cors', signal: AbortSignal.timeout(25000) });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if(data.error === true) throw new Error(data.message || 'API error');
    return data;
  }

  _setStatus(msg, type) {
    const el = document.getElementById('mfxStatusBar');
    if(!el) return;
    el.style.display = msg ? 'block' : 'none';
    el.className     = 'status-bar ' + (type || 'info');
    el.innerHTML     = msg;
  }

  _setDot(s) {
    const dot = document.getElementById('mfxDot');
    const txt = document.getElementById('mfxStatusText');
    if(dot) dot.className = 'mfx-dot' + (s ? ' '+s : '');
    if(txt && s) txt.textContent = {
      connected: 'Connected · Auto-sync on',
      syncing:   'Syncing...',
      error:     'Sync error',
    }[s] || '';
  }

  _showConnected(show) {
    const form    = document.getElementById('mfxLoginForm');
    const wrap    = document.getElementById('mfxAccountsWrap');
    const syncBtn = document.getElementById('mfxSyncBtn');
    if(form)    form.style.display    = show ? 'none'  : 'block';
    if(wrap)    wrap.style.display    = show ? 'block' : 'none';
    if(syncBtn) syncBtn.style.display = show ? 'flex'  : 'none';
  }
}
