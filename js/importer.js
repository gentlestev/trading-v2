// ============================================================
// IMPORTER — Seamless MT5 file import
// Supports: HTML, CSV, PDF from FTMO, The5ers, any MT5 broker
// Features: Auto-detect broker, bulk import, smart dedup
// ============================================================
import { state, saveState, refresh } from './app.js';
import { parseDate, symToIdx, symToName } from './utils.js';
import { updateImportBadge } from '../components/header.js';

export class Importer {
  constructor() {
    this.selectedBroker = 'auto';
    this.processing     = false;
  }

  // Handle single or multiple files
  handleFile(file, statusId, fromLogin = false) {
    if(!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if(ext === 'pdf') {
      this._parsePDF(file, statusId, fromLogin);
    } else {
      const reader = new FileReader();
      reader.onload = e => this._processText(e.target.result, this.selectedBroker, statusId, fromLogin, file.name);
      reader.readAsText(file);
    }
  }

  handleMultipleFiles(files, statusId, fromLogin = false) {
    const arr = [...files];
    if(!arr.length) return;
    if(arr.length === 1) { this.handleFile(arr[0], statusId, fromLogin); return; }

    // Process multiple files sequentially
    let processed = 0;
    let totalAdded = 0;
    const statusEl = document.getElementById(statusId);

    const processNext = (idx) => {
      if(idx >= arr.length) {
        if(statusEl) {
          statusEl.style.display = 'block';
          statusEl.className     = 'import-status ok';
          statusEl.innerHTML     = `✅ Imported ${arr.length} files · <strong>${totalAdded} new trades</strong> added`;
        }
        updateImportBadge();
        refresh();
        if(fromLogin && totalAdded > 0) setTimeout(() => window.app.skipLogin(), 1200);
        return;
      }

      const file = arr[idx];
      const ext  = file.name.split('.').pop().toLowerCase();

      if(statusEl) {
        statusEl.style.display = 'block';
        statusEl.className     = 'import-status info';
        statusEl.textContent   = `Processing ${idx+1}/${arr.length}: ${file.name}...`;
      }

      const onDone = (added) => {
        totalAdded += added;
        setTimeout(() => processNext(idx + 1), 300);
      };

      if(ext === 'pdf') {
        this._parsePDF(file, statusId, false, onDone);
      } else {
        const reader = new FileReader();
        reader.onload = e => {
          const parsed = this._parse(e.target.result, this.selectedBroker, file.name);
          const { added } = this._merge(parsed);
          onDone(added);
        };
        reader.readAsText(file);
      }
    };

    processNext(0);
  }

  _processText(text, broker, statusId, fromLogin, filename = '') {
    const statusEl = document.getElementById(statusId);
    if(statusEl) { statusEl.style.display='block'; statusEl.className='import-status info'; statusEl.textContent='Parsing file...'; }

    try {
      const parsed = this._parse(text, broker, filename);

      if(!parsed.length) {
        if(statusEl) {
          statusEl.className = 'import-status err';
          statusEl.innerHTML = `No trades found in this file.<br>
            <small>Make sure you exported from MT5 → History tab → Right-click → All History → Report → Save as HTML</small>`;
        }
        return;
      }

      const { added, dupes, detectedBroker, acctBal } = this._merge(parsed);
      const balStr = acctBal ? ` · Balance: <strong>$${acctBal.toLocaleString()}</strong>` : '';

      if(statusEl) {
        statusEl.className = 'import-status ok';
        statusEl.innerHTML = `✅ <strong>${detectedBroker}</strong> detected · <strong>${added} trades</strong> imported${balStr}${dupes ? ` · ${dupes} duplicates skipped` : ''}`;
      }

      updateImportBadge();
      refresh();
      if(fromLogin) setTimeout(() => window.app.skipLogin(), 1200);

    } catch(err) {
      console.error('Import error:', err);
      if(statusEl) { statusEl.className='import-status err'; statusEl.textContent='Error: ' + err.message; }
    }
  }

  _parse(text, broker, filename = '') {
    const trimmed = text.trim();
    if(trimmed.startsWith('<') || trimmed.toLowerCase().includes('<html') || trimmed.toLowerCase().includes('<table')) {
      return this._parseHTM(text, broker);
    }
    return this._parseCSV(text, broker);
  }

  _merge(parsed) {
    if(!parsed.length) return { added:0, dupes:0, detectedBroker:'Unknown', acctBal:0 };

    const existingIds   = new Set(state.importedTrades.map(t => t.id));
    const newTrades     = parsed.filter(t => !existingIds.has(t.id));
    const dupes         = parsed.length - newTrades.length;
    const detectedBroker= parsed[0]?.broker || 'Unknown';
    const acctBal       = parsed.find(t => t.accountBalance > 0)?.accountBalance || 0;

    state.importedTrades = [...state.importedTrades, ...newTrades];

    // Update import history
    const existing = state.importHistory.find(h => h.broker === detectedBroker);
    if(existing) {
      existing.total  += newTrades.length;
      existing.added  += newTrades.length;
      existing.date    = new Date().toLocaleDateString();
    } else {
      state.importHistory.unshift({
        id:      'ih_' + Date.now(),
        broker:  detectedBroker,
        date:    new Date().toLocaleDateString(),
        total:   parsed.length,
        added:   newTrades.length,
        dupes,
      });
    }

    saveState();
    return { added: newTrades.length, dupes, detectedBroker, acctBal };
  }

  _parseHTM(text, broker) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(text, 'text/html');
    const body   = doc.body?.textContent || '';

    // Auto-detect broker from file content
    if     (body.includes('Five Percent') || body.includes('FivePercent') || body.includes('fivepercentonline')) broker = 'The5ers';
    else if(body.includes('FTMO s.r.o')   || body.includes('ftmo.com') || body.includes('FTMO Global'))        broker = 'FTMO';
    else if(body.includes('MyFundedFX'))   broker = 'MyFundedFX';
    else if(body.includes('E8 Funding'))   broker = 'E8';
    else if(body.includes('Topstep'))      broker = 'Topstep';
    else if(body.includes('FundedNext'))   broker = 'FundedNext';
    else if(body.includes('Deriv'))        broker = 'Deriv';

    // Get account balance from report header
    let accountBalance = 0;
    doc.querySelectorAll('tr').forEach(row => {
      const cells = [...row.querySelectorAll('th,td')].map(c => c.textContent.trim());
      if((cells[0] === 'Balance:' || cells[0] === 'Equity:') && cells[1]) {
        const val = parseFloat(cells[1].replace(/[\s,]/g,''));
        if(val > accountBalance) accountBalance = val;
      }
    });

    const trades   = [];
    const cleanNum = s => parseFloat((s||'').replace(/[\s,]/g,'')) || 0;

    doc.querySelectorAll('table').forEach(table => {
      const rows = [...table.querySelectorAll('tr')];
      let inPos  = false;
      let hdrIdx = -1;
      let colMap = {};

      rows.forEach((row, ri) => {
        const cells = [...row.querySelectorAll('th,td')].map(c => c.textContent.trim());

        // Section markers
        if(cells.length === 1) {
          if(cells[0] === 'Positions') { inPos = true; return; }
          if(['Orders','Deals','Results','Summary','Balance Drawdown:'].includes(cells[0])) { inPos = false; return; }
        }

        // Detect header row
        if(inPos && hdrIdx < 0) {
          const lower = cells.map(c => c.toLowerCase());
          if(lower.includes('symbol') && lower.includes('type') && lower.includes('profit')) {
            hdrIdx = ri;
            // Map column names to indices
            lower.forEach((h, i) => { colMap[h] = i; });
            return;
          }
        }

        if(!inPos || hdrIdx < 0 || ri <= hdrIdx) return;
        if(cells.length < 10) return;

        const sym  = cells[colMap['symbol'] ?? 2] || '';
        const type = (cells[colMap['type'] ?? 3] || '').toLowerCase();

        if(!sym || !type || (!type.includes('buy') && !type.includes('sell'))) return;
        if(['balance','deposit','withdrawal','credit'].includes(sym.toLowerCase())) return;

        // Handle both 13-col and 14-col MT5 formats
        let lots, openP, closeP, comm, swap, profit, openTime, ticket;

        if(cells.length >= 14) {
          // 14-col: openTime, ticket, symbol, type, blank, volume, SL, TP, openPrice, closeTime, closePrice, comm, swap, profit
          openTime = cells[0]; ticket = cells[1];
          lots  = cleanNum(cells[5]);
          openP = cleanNum(cells[8]); closeP = cleanNum(cells[10]);
          comm  = cleanNum(cells[11]); swap = cleanNum(cells[12]); profit = cleanNum(cells[13]);
        } else {
          // 13-col: openTime, ticket, symbol, type, volume, SL, TP, openPrice, closeTime, closePrice, comm, swap, profit
          openTime = cells[0]; ticket = cells[1];
          lots  = cleanNum(cells[4]);
          openP = cleanNum(cells[7]); closeP = cleanNum(cells[9]);
          comm  = cleanNum(cells[10]); swap = cleanNum(cells[11]); profit = cleanNum(cells[12]);
        }

        if(!lots || lots <= 0) return;

        trades.push({
          id:             'imp_' + (ticket||ri) + '_' + broker,
          instrument:     symToName(sym),
          idx:            symToIdx(sym),
          symbol:         sym,
          direction:      type.includes('buy') ? 'BUY' : 'SELL',
          lots,
          open:           openP,
          close:          closeP,
          date:           parseDate(openTime),
          pnl:            parseFloat((profit + comm + swap).toFixed(2)),
          src:            'import',
          broker,
          accountBalance,
        });
      });
    });

    return trades.filter(t => t.date && !isNaN(t.pnl));
  }

  _parseCSV(text, broker) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    let hdrIdx  = -1;
    let headers = [];

    for(let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if(lower.includes('ticket') || lower.includes('symbol') || lower.includes('instrument')) {
        hdrIdx  = i;
        headers = lines[i].split(/[,;\t]/).map(h => h.trim().replace(/"/g,'').toLowerCase());
        break;
      }
    }
    if(hdrIdx < 0) return [];

    const col = (row, names) => {
      for(const n of names) {
        const i = headers.findIndex(h => h.includes(n));
        if(i >= 0 && row[i] !== undefined) return row[i].replace(/"/g,'').trim();
      }
      return '';
    };

    const trades = [];
    for(let i = hdrIdx+1; i < lines.length; i++) {
      const row = lines[i].split(/[,;\t]/).map(c => c.replace(/"/g,'').trim());
      if(row.length < 5) continue;

      const sym  = col(row, ['symbol','instrument','pair']);
      if(!sym || ['balance','deposit','withdrawal'].includes(sym.toLowerCase())) continue;

      const type = col(row, ['type','action','direction']).toLowerCase();
      const pnl  = parseFloat(col(row, ['profit','p/l','pnl','net']).replace(/[^\d.-]/g,'')) || 0;
      const lots = parseFloat(col(row, ['lots','volume','size','qty']).replace(/[^\d.-]/g,'')) || 1;
      const ticket = col(row, ['ticket','order','id','#']) || String(i);

      trades.push({
        id:         'imp_' + ticket + '_' + broker,
        instrument:  symToName(sym),
        idx:         symToIdx(sym),
        direction:   type.includes('buy') || type === '0' ? 'BUY' : 'SELL',
        lots,
        open:        parseFloat(col(row, ['open price','entry','open']).replace(/[^\d.-]/g,'')) || 0,
        close:       parseFloat(col(row, ['close price','exit','close']).replace(/[^\d.-]/g,'')) || 0,
        date:        parseDate(col(row, ['open time','open date','date','time'])),
        pnl,
        src:         'import',
        broker,
      });
    }
    return trades.filter(t => t.date && !isNaN(t.pnl));
  }

  async _parsePDF(file, statusId, fromLogin, onDone = null) {
    const statusEl = document.getElementById(statusId);
    if(statusEl) { statusEl.style.display='block'; statusEl.className='import-status info'; statusEl.textContent='Reading PDF...'; }

    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let lines = [];

      for(let p = 1; p <= pdf.numPages; p++) {
        const page    = await pdf.getPage(p);
        const content = await page.getTextContent();
        const byY     = {};
        content.items.forEach(item => {
          const y = Math.round(item.transform[5]);
          if(!byY[y]) byY[y] = [];
          byY[y].push({ x: item.transform[4], text: item.str.trim() });
        });
        Object.keys(byY).map(Number).sort((a,b)=>b-a).forEach(y => {
          const line = byY[y].sort((a,b)=>a.x-b.x).map(i=>i.text).filter(t=>t).join(' ');
          if(line.trim()) lines.push(line.trim());
        });
      }

      const parsed = this._parsePDFLines(lines, this.selectedBroker);
      if(!parsed.length) {
        if(statusEl) {
          statusEl.className = 'import-status err';
          statusEl.innerHTML = 'PDF summary detected — no individual trades found.<br><small>Use <strong>Save as Report (HTML)</strong> from MT5 History tab for best results.</small>';
        }
        if(onDone) onDone(0);
        return;
      }

      const { added, dupes, detectedBroker } = this._merge(parsed);
      if(statusEl) {
        statusEl.className = 'import-status ok';
        statusEl.textContent = `✅ ${detectedBroker} · ${added} trades from PDF${dupes?' · '+dupes+' skipped':''}`;
      }
      updateImportBadge();
      refresh();
      if(fromLogin && added > 0) setTimeout(() => window.app.skipLogin(), 1200);
      if(onDone) onDone(added);

    } catch(err) {
      if(statusEl) { statusEl.className='import-status err'; statusEl.textContent='PDF error: '+err.message+'. Try HTML or CSV instead.'; }
      if(onDone) onDone(0);
    }
  }

  _parsePDFLines(lines, broker) {
    const trades = [];
    for(const line of lines) {
      const m = line.match(/^(\d{6,12})\s+(\d{4}\.\d{2}\.\d{2})\s+[\d:]+\s+(buy|sell)\s+([\d.]+)\s+(.+?)\s+([\d.]+).*?(-?[\d.]+)\s*$/i);
      if(m) {
        const sym = m[5].trim();
        trades.push({
          id:         'pdf_'+m[1]+'_'+broker,
          instrument:  symToName(sym),
          idx:         symToIdx(sym),
          direction:   m[3].toUpperCase(),
          lots:        parseFloat(m[4]),
          open:        parseFloat(m[6]),
          close:       0,
          date:        m[2].replace(/\./g,'-').slice(0,10),
          pnl:         parseFloat(m[7]),
          src:         'import',
          broker,
        });
      }
    }
    return trades;
  }

  deleteImport(broker) {
    if(!confirm(`Remove all ${broker} trades? This cannot be undone.`)) return;
    state.importedTrades = state.importedTrades.filter(t => t.broker !== broker);
    state.importHistory  = state.importHistory.filter(h => h.broker !== broker);
    saveState();
    if(state.activeAcct === broker) window.app.switchAcct('all');
    updateImportBadge();
    refresh();
    window.app.hideImportPanel();
  }

  // ── IMPORT PANEL UI ─────────────────────────────────────────
  renderPanel() {
    return `
      <div class="import-panel-box">
        <button onclick="window.app.hideImportPanel()"
          style="position:absolute;top:12px;right:12px;background:var(--surface2);border:none;color:var(--muted);cursor:pointer;border-radius:6px;padding:3px 9px;font-size:17px;">✕</button>

        <div style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;margin-bottom:4px;">Import MT5 Trades</div>
        <p style="font-size:10px;color:var(--muted);margin-bottom:18px;line-height:1.8;">
          Works with <strong style="color:var(--gold)">FTMO</strong>, <strong style="color:var(--purple)">The5ers</strong>, Deriv MT5, and any MT5 broker.<br>
          Broker is auto-detected from the file. Duplicates are skipped automatically.
        </p>

        <!-- Drop zone — supports multiple files -->
        <div class="import-status" id="panelStatus"></div>
        <div class="drop-zone" id="panelDropZone" style="padding:32px 20px;">
          <input type="file" id="panelFileInput" accept=".csv,.htm,.html,.pdf" multiple>
          <div class="drop-icon" style="font-size:36px;">📂</div>
          <div class="drop-text" style="font-size:12px;">
            <strong>Click to select</strong> or drag &amp; drop your MT5 export<br>
            <span style="font-size:10px;">Supports <strong>.HTML</strong> · <strong>.CSV</strong> · <strong>.PDF</strong> · Multiple files at once</span>
          </div>
        </div>

        <!-- How to export guide -->
        <div style="background:var(--surface2);border:1px solid rgba(0,229,176,0.15);border-radius:10px;padding:14px;margin-top:14px;">
          <div style="font-size:10px;font-weight:700;color:var(--green);margin-bottom:10px;letter-spacing:1px;text-transform:uppercase;">How to export from MT5</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${[
              ['1','Open MT5 → press <strong>Ctrl+T</strong> to open Terminal'],
              ['2','Click the <strong>History</strong> tab at the bottom'],
              ['3','Right-click anywhere → <strong>All History</strong>'],
              ['4','Right-click again → <strong>Report</strong> → Save as <strong>HTML</strong>'],
              ['5','Come back here and drop the saved file'],
            ].map(([n,t]) => `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <span style="width:20px;height:20px;border-radius:50%;background:var(--green);color:#000;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${n}</span>
                <span style="font-size:10px;color:var(--muted);line-height:1.7;">${t}</span>
              </div>`).join('')}
          </div>
        </div>

        <!-- Import history -->
        ${state.importHistory.length ? `
          <div style="margin-top:16px;">
            <div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Imported Accounts</div>
            <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
              ${state.importHistory.map(h => `
                <div class="import-item" style="padding:8px 12px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="broker-tag ${h.broker==='FTMO'?'ftmo':h.broker==='The5ers'?'five':'deriv'}">${h.broker}</span>
                    <span style="font-size:10px;">${h.added} trades</span>
                    <span style="font-size:9px;color:var(--muted);">· ${h.date}</span>
                  </div>
                  <button class="import-del" data-delimport="${h.broker}" title="Remove ${h.broker} trades">✕</button>
                </div>`).join('')}
            </div>
          </div>` : ''}
      </div>`;
  }

  bindPanel() {
    const fileInput = document.getElementById('panelFileInput');
    const dropZone  = document.getElementById('panelDropZone');

    fileInput?.addEventListener('change', e => {
      this.handleMultipleFiles(e.target.files, 'panelStatus', false);
    });

    dropZone?.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone?.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
    dropZone?.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      this.handleMultipleFiles(e.dataTransfer.files, 'panelStatus', false);
    });

    document.querySelectorAll('[data-delimport]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteImport(btn.dataset.delimport));
    });
  }
}
