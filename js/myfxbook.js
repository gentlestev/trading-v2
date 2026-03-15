// ============================================================
// MYFXBOOK SYNC MODULE
// ============================================================
import { state, saveState, refresh } from './app.js';
import { parseDate, symToIdx, symToName } from './utils.js';
import { updateImportBadge } from '../components/header.js';

const MFX_PROXY  = 'https://scintillating-zuccutto-9bf82f.netlify.app/.netlify/functions/mfxapi';
const MFX_KNOWN  = [
  { id:'11593082', broker:'FTMO',       name:'FTMO Demo' },
  { id:'11970519', broker:'FTMO',       name:'FTMO DEMO2' },
  { id:'11970510', broker:'The5ers',    name:'The5ers' },
  { id:'11970633', broker:'Deriv Real', name:'Deriv MT5 Real' },
  { id:'11970638', broker:'Deriv Demo', name:'Deriv MT5 Demo' },
];

export class MyfxbookAPI {
  constructor() {
    this.session  = localStorage.getItem('mfxSession') || null;
    this.email    = localStorage.getItem('mfxEmail')   || '';
    this.accounts = JSON.parse(localStorage.getItem('mfxAccounts') || '[]');
    this.syncing  = false;
    this.timer    = null;
  }

  async connect() {
    const emailEl = document.getElementById('mfxEmailInput');
    const passEl  = document.getElementById('mfxPassInput');
    const email   = emailEl?.value?.trim();
    const pass    = passEl?.value?.trim();
    if(!email || !pass) { this._setStatus('Please enter email and password', 'err'); return; }

    const btn = document.getElementById('mfxConnectBtn');
    if(btn) { btn.disabled=true; btn.textContent='Connecting...'; }
    this._setStatus('Connecting to Myfxbook...', 'info');

    try {
      const data = await this._call('loginandaccounts', { email, password: pass });
      if(!data.session) throw new Error(data.message || 'Login failed');

      this.session = data.session;
      this.email   = email;
      localStorage.setItem('mfxSession', this.session);
      localStorage.setItem('mfxEmail',   email);
      localStorage.setItem('mfxPass',    pass);

      this.accounts = data.accounts?.length
        ? data.accounts
        : MFX_KNOWN.map(k => ({ id:k.id, name:k.name, broker:k.broker, balance:0, profit:0, gain:0 }));
      localStorage.setItem('mfxAccounts', JSON.stringify(this.accounts));

      this._showAccountsWrap(true);
      this._setDot('connected');
      this._setStatus('Connected! Syncing...', 'ok');
      this._renderAccounts();
      await this.sync();
      this.timer = setInterval(() => this.sync(), 10*60*1000);

    } catch(err) {
      this._setStatus('Error: ' + err.message, 'err');
      if(btn) { btn.disabled=false; btn.textContent='Connect to Myfxbook'; }
    }
  }

  async sync() {
    if(this.syncing) return;
    this.syncing = true;
    this._setDot('syncing');

    const syncBtn = document.getElementById('mfxSyncBtn');
    if(syncBtn) { syncBtn.classList.add('syncing'); syncBtn.textContent='Syncing...'; }

    const email = localStorage.getItem('mfxEmail') || '';
    const pass  = localStorage.getItem('mfxPass')  || '';

    if(!email || !pass) {
      this._setStatus('Reconnect Myfxbook — credentials missing', 'err');
      this.syncing = false;
      return;
    }

    try {
      this._setStatus('Syncing all accounts...', 'info');
      const res = await this._call('syncall', {
        email, password: pass,
        ids: MFX_KNOWN.map(k=>k.id).join(','),
      });

      if(res.error) throw new Error(res.message || 'Sync failed');

      // Update balances
      if(res.accounts?.length) {
        res.accounts.forEach(a => {
          const local = this.accounts.find(x => String(x.id) === String(a.id));
          if(local) { Object.assign(local, { balance:parseFloat(a.balance||0), profit:parseFloat(a.profit||0), gain:parseFloat(a.gain||0), name:a.name||local.name }); }
        });
        localStorage.setItem('mfxAccounts', JSON.stringify(this.accounts));
        this._renderAccounts();
      }

      // Process trades
      let added = 0;
      if(res.trades?.length) {
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
      const lastSyncEl = document.getElementById('mfxLastSync');
      if(lastSyncEl) lastSyncEl.textContent = `Last synced: ${now} · ${added} new trades`;
      this._setStatus(added > 0 ? `Synced · ${added} new trades added` : 'Up to date', 'ok');
      this._setDot('connected');
      updateImportBadge();
      if(added > 0) refresh();

    } catch(err) {
      this._setStatus('Sync error: ' + err.message, 'err');
      this._setDot('error');
    }

    this.syncing = false;
    if(syncBtn) { syncBtn.classList.remove('syncing'); syncBtn.textContent='Sync'; }
  }

  syncNow() { this.sync(); }

  disconnect() {
    if(!confirm('Disconnect Myfxbook? Imported trades will remain.')) return;
    if(this.timer) clearInterval(this.timer);
    this.session  = null;
    this.accounts = [];
    localStorage.removeItem('mfxSession');
    localStorage.removeItem('mfxAccounts');
    localStorage.removeItem('mfxPass');
    this._showAccountsWrap(false);
    this._setDot('');
    this._setStatus('', '');
    document.getElementById('mfxSyncBtn')?.style.setProperty('display','none');
  }

  async autoRestore() {
    if(!this.session) return;
    const email = this.email;
    const proxy = document.getElementById('mfxProxyInput');
    if(proxy) proxy.value = MFX_PROXY;

    if(!this.accounts.length) {
      this.accounts = MFX_KNOWN.map(k => ({ id:k.id, name:k.name, broker:k.broker, balance:0, profit:0, gain:0 }));
    }
    this._showAccountsWrap(true);
    this._setDot('connected');
    this._renderAccounts();
    this._setStatus('Session restored. Syncing...', 'ok');
    await this.sync();
    this.timer = setInterval(() => this.sync(), 10*60*1000);
  }

  renderPanel(container) {
    if(!container) return;
    const isConnected = !!this.session;
    container.innerHTML = `
      <div class="mfx-panel">
        <div class="mfx-title">
          Myfxbook Live Sync
          <div style="display:flex;align-items:center;gap:6px;font-size:10px;">
            <span class="mfx-dot ${isConnected?'connected':''}" id="mfxDot"></span>
            <span id="mfxStatusText" style="color:var(--muted)">${isConnected?'Connected':'Not connected'}</span>
          </div>
        </div>

        <!-- Login form -->
        <div id="mfxLoginForm" ${isConnected?'style="display:none"':''}>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
            <div><div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;">Email</div>
              <input type="email" class="text-input sm" id="mfxEmailInput" placeholder="myfxbook@email.com" value="${this.email}"></div>
            <div><div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;">Password</div>
              <input type="password" class="text-input sm" id="mfxPassInput" placeholder="••••••••"
                value="${localStorage.getItem('mfxPass')||''}"></div>
          </div>
          <button class="btn btn-gold btn-full" id="mfxConnectBtn" onclick="window.myfxbookAPI.connect()">
            Connect to Myfxbook
          </button>
        </div>

        <!-- Status bar -->
        <div class="status-bar" id="mfxStatusBar" style="display:none;margin-top:8px;"></div>

        <!-- Connected accounts -->
        <div id="mfxAccountsWrap" ${isConnected?'':'style="display:none"'}>
          <div id="mfxAccountsList"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:9px;">
            <span id="mfxLastSync" style="color:var(--muted);">Never synced</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm btn-gold" onclick="window.myfxbookAPI.syncNow()">Sync Now</button>
              <button class="btn btn-sm btn-blue" onclick="window.myfxbookAPI.autoRestore()">Reconnect</button>
              <button class="btn btn-sm btn-red"  onclick="window.myfxbookAPI.disconnect()">Disconnect</button>
            </div>
          </div>
        </div>
      </div>`;

    if(isConnected) this._renderAccounts();
  }

  _renderAccounts() {
    const el = document.getElementById('mfxAccountsList');
    if(!el) return;
    const colors = { FTMO:'var(--gold)', The5ers:'var(--purple)', 'Deriv Real':'var(--green)', 'Deriv Demo':'var(--cyan)' };

    el.innerHTML = (this.accounts.length ? this.accounts : MFX_KNOWN).map(acc => {
      const known  = MFX_KNOWN.find(k => String(k.id) === String(acc.id));
      const broker = known?.broker || acc.broker || 'MT5';
      const col    = colors[broker] || 'var(--blue)';
      const bal    = parseFloat(acc.balance||0);
      const profit = parseFloat(acc.profit||0);
      const gain   = parseFloat(acc.gain||0);

      return `<div class="mfx-account-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
          <div>
            <div class="mfx-account-name">${acc.name || broker}</div>
            <div style="font-size:9px;color:var(--muted);">ID: ${acc.id}</div>
          </div>
          <span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;background:${col}20;color:${col}">${broker}</span>
        </div>
        <div class="mfx-account-stats">
          <div class="mfx-stat"><div class="mfx-stat-v" style="color:${bal>0?'var(--green)':'var(--muted)'}">${bal>0?'$'+bal.toLocaleString():'—'}</div><div class="mfx-stat-l">Balance</div></div>
          <div class="mfx-stat"><div class="mfx-stat-v" style="color:${profit>=0?'var(--green)':'var(--red)'}">${profit?((profit>=0?'+':'')+profit.toFixed(2)):'—'}</div><div class="mfx-stat-l">Profit</div></div>
          <div class="mfx-stat"><div class="mfx-stat-v" style="color:${gain>=0?'var(--green)':'var(--red)'}">${gain?((gain>=0?'+':'')+gain.toFixed(2)+'%'):'—'}</div><div class="mfx-stat-l">Gain</div></div>
        </div>
        ${bal===0?'<div style="font-size:9px;color:var(--muted);margin-top:6px;padding:4px 8px;background:rgba(255,255,255,0.03);border-radius:5px;">Click Sync Now to load balance & trades</div>':''}
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
    const uid  = t.openOrderId || t.id || (sym + openTime);

    return {
      id:             'mfx_'+uid+'_'+broker,
      instrument:     symToName(sym),
      idx:            symToIdx(sym),
      symbol:         sym,
      direction:      type.includes('buy')?'BUY':'SELL',
      lots,
      open:           parseFloat(t.openPrice||0),
      close:          parseFloat(t.closePrice||0),
      date:           parseDate(t.closeTime||openTime),
      pnl:            parseFloat(pnl.toFixed(2)),
      src:            'import',
      broker,
      accountBalance: parseFloat(acc.balance||0),
      source:         'myfxbook',
    };
  }

  async _call(action, params={}) {
    const qs  = Object.entries({ action, ...params }).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const url = MFX_PROXY + '?' + qs;
    const res = await fetch(url, { method:'GET', mode:'cors', signal: AbortSignal.timeout(20000) });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if(data.error) throw new Error(data.message || 'API error');
    return data;
  }

  _setStatus(msg, type) {
    const el = document.getElementById('mfxStatusBar');
    if(!el) return;
    el.style.display = msg ? 'block' : 'none';
    el.className     = 'status-bar ' + (type||'info');
    el.innerHTML     = msg;
  }

  _setDot(state) {
    const dot = document.getElementById('mfxDot');
    const txt = document.getElementById('mfxStatusText');
    if(dot) dot.className = 'mfx-dot' + (state?' '+state:'');
    if(txt && state) {
      txt.textContent = { connected:'Connected · Auto-sync on', syncing:'Syncing...', error:'Sync error' }[state] || '';
    }
  }

  _showAccountsWrap(show) {
    const form = document.getElementById('mfxLoginForm');
    const wrap = document.getElementById('mfxAccountsWrap');
    const btn  = document.getElementById('mfxSyncBtn');
    if(form) form.style.display = show ? 'none' : 'block';
    if(wrap) wrap.style.display = show ? 'block' : 'none';
    if(btn)  btn.style.display  = show ? 'flex'  : 'none';
  }
}
