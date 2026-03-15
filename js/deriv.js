// ============================================================
// DERIV API — WebSocket connection
// ============================================================
import { state, refresh, skipLogin, fmtMoney } from './app.js';

const WSURL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';

export class DerivAPI {
  constructor() {
    this.ws      = null;
    this.tok     = null;
    this.ping    = null;
    this.acct    = {};
    this.timer   = null;
  }

  connect() {
    const input = document.getElementById('tokenInput');
    const t     = input?.value?.trim();
    if(!t) { this._showErr('Please enter your API token.'); return; }

    this.tok = t;
    this._setBtn(true);
    this._showSpin(true);
    this._showErr('');
    this._openWS(t);
  }

  _openWS(t) {
    if(this.ws) { try { this.ws.close(); } catch(e) {} }
    this.ws = new WebSocket(WSURL);

    // Auth timeout — 15 seconds
    this.timer = setTimeout(() => {
      if(!state.derivConnected) {
        this._showErr('Connection timed out. Please get a new token from app.deriv.com/account/api-token');
        this._setBtn(false);
        this._showSpin(false);
        try { this.ws.close(); } catch(e) {}
      }
    }, 15000);

    this.ws.onopen    = () => this._send({ authorize: t });
    this.ws.onmessage = e  => { const m = JSON.parse(e.data); if(m.msg_type==='authorize'||m.error) clearTimeout(this.timer); this._handle(m); };
    this.ws.onerror   = () => { clearTimeout(this.timer); this._showErr('Connection error. Check token and try again.'); this._setBtn(false); this._showSpin(false); };
    this.ws.onclose   = () => { clearTimeout(this.timer); if(state.derivConnected) { this._setConnBar(false); setTimeout(() => { if(this.tok) this._openWS(this.tok); }, 5000); } };
  }

  _send(o) { if(this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }

  _handle(m) {
    if(m.error) {
      const code = m.error.code;
      if(code === 'InvalidToken' || code === 'AuthorizationRequired') {
        this._showErr('Invalid token. Please get a new one from app.deriv.com/account/api-token');
        this._setBtn(false);
        this._showSpin(false);
        localStorage.removeItem('dtok');
      }
      return;
    }
    const t = m.msg_type;
    if     (t === 'authorize')             this._onAuth(m.authorize);
    else if(t === 'balance')               this._onBal(m.balance);
    else if(t === 'profit_table')          this._onPT(m.profit_table);
    else if(t === 'portfolio')             this._onPort(m.portfolio);
    else if(t === 'proposal_open_contract')this._onPOC(m.proposal_open_contract);
    else if(t === 'transaction')           this._onTx(m.transaction);
    else if(t === 'ping')                  this._send({ pong: 1 });
  }

  _onAuth(a) {
    state.derivConnected = true;
    state.derivAcct      = a;
    this.acct            = a;

    // Save token
    localStorage.setItem('dtok', this.tok);

    // Hide login, show app
    this._setBtn(false);
    this._showSpin(false);
    skipLogin();

    // Update header
    const badge = document.getElementById('headerBadge');
    const sub   = document.getElementById('headerSub');
    const bal   = document.getElementById('headerBal');
    if(badge) badge.textContent = a.is_virtual ? 'Demo Account' : 'Live Account';
    if(sub)   sub.innerHTML = `<span class="ldot"></span>${a.email || 'Connected'} · ${a.currency || 'USD'}`;
    if(bal)   bal.textContent = `${a.currency || '$'}${parseFloat(a.balance || 0).toFixed(2)}`;

    this._setConnBar(true);

    // Subscribe
    this._send({ balance: 1, subscribe: 1 });
    this._fetchPT(0);
    this._send({ portfolio: 1 });
    this._send({ transaction: 1, subscribe: 1 });
    this.ping = setInterval(() => this._send({ ping: 1 }), 30000);

    console.log('Deriv connected:', a.email, '| balance:', a.balance, '| currency:', a.currency);
  }

  _onBal(b) {
    const el = document.getElementById('headerBal');
    if(el) el.textContent = `${this.acct.currency || '$'}${parseFloat(b.balance).toFixed(2)}`;
  }

  _fetchPT(off) {
    console.log('Requesting profit_table offset:', off);
    this._send({
      profit_table: 1,
      description:  1,
      limit:        100,
      offset:       off,
      sort:         'DESC',
      date_from:    0,
    });
  }

  _onPT(pt) {
    const tx = pt.transactions || [];
    console.log('profit_table received:', tx.length, 'transactions | total so far:', state.liveTrades.length);
    if(tx.length > 0) console.log('Sample trade:', JSON.stringify(tx[0]).slice(0,200));

    tx.forEach(t => {
      const tr = this._txToTrade(t);
      if(tr && !state.liveTrades.find(x => x.id === tr.id)) {
        state.liveTrades.push(tr);
      }
    });

    console.log('liveTrades after processing:', state.liveTrades.length);

    if(tx.length === 100) {
      this._fetchPT(state.liveTrades.length);
    } else {
      refresh();
    }
    if(tx.length < 100) refresh();
  }

  _txToTrade(tx) {
    if(!tx || !tx.transaction_id) return null;

    const sm = {
      'R_10':'V10','R_25':'V25','R_50':'V50','R_75':'V75','R_100':'V100',
      '1HZ10V':'V10','1HZ25V':'V25','1HZ50V':'V50','1HZ75V':'V75','1HZ100V':'V100',
    };
    const raw = tx.underlying_symbol || '';
    const idx = sm[raw] || (raw.startsWith('R_') ? 'V'+raw.slice(2) : raw) || 'OTHER';

    const names = {
      V10:'Volatility 10 Index', V25:'Volatility 25 Index',
      V50:'Volatility 50 Index', V75:'Volatility 75 Index', V100:'Volatility 100 Index',
    };
    const nm  = names[idx] || raw || idx;
    const ct  = (tx.contract_type || '').toUpperCase();
    const dir = ct.includes('CALL')||ct.includes('RISE')||ct.includes('HIGHER')||ct.includes('TOUCH') ? 'BUY' : 'SELL';
    const d   = tx.purchase_time
      ? new Date(tx.purchase_time * 1000).toISOString().slice(0,10)
      : new Date().toISOString().slice(0,10);

    return {
      id:        'lv_' + tx.transaction_id,
      instrument: nm,
      idx,
      direction:  dir,
      lots:       parseFloat(tx.buy_price || tx.stake || 1),
      open:       parseFloat(tx.entry_spot || 0),
      close:      parseFloat(tx.exit_spot  || 0),
      date:       d,
      pnl:        parseFloat(tx.profit_loss || 0),
      src:        'live',
      broker:     'Deriv',
    };
  }

  _onPort(p) {
    state.openPos = (p.contracts || []).map(c => ({
      id:   c.contract_id,
      name: c.display_name || c.underlying,
      type: c.contract_type,
      bp:   parseFloat(c.buy_price  || 0),
      cur:  parseFloat(c.bid_price  || 0),
      pnl:  parseFloat(c.bid_price  || 0) - parseFloat(c.buy_price || 0),
      dt:   new Date(c.purchase_time * 1000).toLocaleTimeString(),
    }));
    // Re-render live page if active
    import('../pages/live.js').then(m => m.renderOpenPositions?.());
    state.openPos.forEach(p => this._send({ proposal_open_contract: 1, contract_id: p.id, subscribe: 1 }));
  }

  _onPOC(poc) {
    if(!state.openPos) return;
    const i = state.openPos.findIndex(p => p.id === poc.contract_id);
    if(i >= 0) {
      state.openPos[i].cur = parseFloat(poc.bid_price || 0);
      state.openPos[i].pnl = state.openPos[i].cur - state.openPos[i].bp;
      if(poc.status === 'sold' || poc.status === 'expired') state.openPos.splice(i, 1);
      import('../pages/live.js').then(m => m.renderOpenPositions?.());
    }
  }

  _onTx(tx) {
    if(tx.action === 'sell') {
      import('../pages/live.js').then(m => m.addFeedItem?.(tx));
      setTimeout(() => this._fetchPT(0), 1500);
    }
  }

  disconnect() {
    state.derivConnected = false;
    if(this.ws)   this.ws.close();
    if(this.ping) clearInterval(this.ping);
    clearTimeout(this.timer);
    state.liveTrades = [];
    state.openPos    = [];
    state.derivAcct  = {};
    this.tok         = null;
    localStorage.removeItem('dtok');
    this._setConnBar(false);

    // Show login
    import('./app.js').then(m => m.showLogin());
  }

  _setConnBar(live) {
    const bar = document.getElementById('connBar');
    if(!bar) return;
    bar.className = 'conn-bar ' + (live ? 'live' : 'offline');
    bar.textContent = live
      ? '● Live — Connected to Deriv API'
      : '● Disconnected — Reconnecting...';
  }

  _setBtn(disabled) {
    const btn = document.getElementById('connectBtn');
    if(btn) btn.disabled = disabled;
  }

  _showSpin(show) {
    const el = document.getElementById('spinWrap');
    if(el) el.style.display = show ? 'block' : 'none';
  }

  _showErr(msg) {
    const el = document.getElementById('loginErr');
    if(!el) return;
    el.textContent    = msg;
    el.style.display  = msg ? 'block' : 'none';
  }
}
