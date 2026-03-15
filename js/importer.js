// ============================================================
// IMPORTER — MT5 file parser (CSV, HTML, PDF)
// ============================================================
import { state, saveState, refresh } from './app.js';
import { parseDate, symToIdx, symToName } from './utils.js';
import { updateImportBadge } from '../components/header.js';

export class Importer {
  constructor() {
    this.selectedBroker = 'FTMO';
  }

  handleFile(file, statusId, fromLogin=false) {
    if(!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if(ext === 'pdf') {
      this._parsePDF(file, statusId, fromLogin);
    } else {
      const reader = new FileReader();
      reader.onload = e => this._processText(e.target.result, this.selectedBroker, statusId, fromLogin);
      reader.readAsText(file);
    }
  }

  _processText(text, broker, statusId, fromLogin) {
    const status = document.getElementById(statusId);
    if(status) { status.style.display='block'; status.className='import-status info'; status.textContent='Parsing file...'; }

    try {
      const trimmed = text.trim();
      let parsed;
      if(trimmed.startsWith('<') || trimmed.toLowerCase().includes('<html') || trimmed.toLowerCase().includes('<table')) {
        parsed = this._parseHTM(text, broker);
      } else {
        parsed = this._parseCSV(text, broker);
      }

      if(!parsed.length) {
        if(status) { status.className='import-status err'; status.textContent='No trades found. Make sure you exported from the History tab in MT5.'; }
        return;
      }

      const { added, dupes } = this._mergeTrades(parsed);
      const detectedBroker   = parsed[0]?.broker || broker;
      const acctBal          = parsed.find(t => t.accountBalance > 0)?.accountBalance;
      const balStr           = acctBal ? ` · Balance: $${acctBal.toLocaleString()}` : '';

      if(status) {
        status.className = 'import-status ok';
        status.innerHTML = `<strong>${detectedBroker}</strong> · ${added} trades imported${balStr}${dupes ? ` · ${dupes} skipped` : ''}`;
      }

      updateImportBadge();
      refresh();
      if(fromLogin) setTimeout(() => window.app.skipLogin(), 1200);

    } catch(err) {
      if(status) { status.className='import-status err'; status.textContent='Parse error: ' + err.message; }
    }
  }

  _mergeTrades(parsed) {
    const existingIds = new Set(state.importedTrades.map(t => t.id));
    const newTrades   = parsed.filter(t => !existingIds.has(t.id));
    const dupes       = parsed.length - newTrades.length;
    state.importedTrades = [...state.importedTrades, ...newTrades];
    saveState();

    // Log import history
    const broker = parsed[0]?.broker || 'Unknown';
    const exists = state.importHistory.find(h => h.broker === broker);
    if(!exists) {
      state.importHistory.unshift({
        id: 'ih_'+Date.now(), broker,
        date: new Date().toLocaleDateString(),
        total: parsed.length, added: newTrades.length, dupes,
      });
    } else {
      exists.total += newTrades.length;
      exists.added += newTrades.length;
    }
    saveState();
    return { added: newTrades.length, dupes };
  }

  _parseHTM(text, broker) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(text, 'text/html');
    const body   = doc.body?.textContent || '';

    // Auto-detect broker from content
    if     (body.includes('Five Percent') || body.includes('FivePercent')) broker = 'The5ers';
    else if(body.includes('FTMO s.r.o')   || body.includes('ftmo.com') || body.includes('FTMO Global')) broker = 'FTMO';
    else if(body.includes('MyFundedFX'))  broker = 'MyFundedFX';
    else if(body.includes('E8 Funding'))  broker = 'E8';
    else if(body.includes('Topstep'))     broker = 'Topstep';

    // Get balance
    let accountBalance = 0;
    doc.querySelectorAll('tr').forEach(row => {
      const cells = [...row.querySelectorAll('th,td')].map(c => c.textContent.trim());
      if((cells[0]==='Balance:'||cells[0]==='Equity:') && cells[1]) {
        accountBalance = parseFloat(cells[1].replace(/\s/g,'').replace(/,/g,'')) || 0;
      }
    });

    const trades = [];
    const cleanNum = s => parseFloat((s||'').replace(/\s/g,'').replace(/,/g,'')) || 0;

    doc.querySelectorAll('table').forEach(table => {
      const rows  = [...table.querySelectorAll('tr')];
      let inPos   = false;
      let hdrIdx  = -1;

      rows.forEach((row, ri) => {
        const cells = [...row.querySelectorAll('th,td')].map(c => c.textContent.trim());

        if(cells.length === 1) {
          if(cells[0] === 'Positions') { inPos = true; return; }
          if(['Orders','Deals','Results','Summary'].includes(cells[0])) { inPos = false; return; }
        }

        if(inPos && hdrIdx < 0) {
          const lower = cells.map(c => c.toLowerCase());
          if(lower.includes('symbol') && lower.includes('type') && lower.includes('profit')) { hdrIdx = ri; return; }
        }

        if(!inPos || hdrIdx < 0 || ri <= hdrIdx) return;
        if(cells.length < 12) return;

        const sym  = cells[2] || '';
        const type = (cells[3] || '').toLowerCase();
        if(!sym || !type || (!type.includes('buy') && !type.includes('sell'))) return;
        if(['balance','deposit','withdrawal','credit'].includes(sym.toLowerCase())) return;

        let lots=cleanNum(cells[5]), openP=cleanNum(cells[8]), closeP=cleanNum(cells[10]);
        let comm=cleanNum(cells[11]), swap=cleanNum(cells[12]), profit=cleanNum(cells[13]);
        if(cells.length===13){lots=cleanNum(cells[4]);openP=cleanNum(cells[7]);closeP=cleanNum(cells[9]);comm=cleanNum(cells[10]);swap=cleanNum(cells[11]);profit=cleanNum(cells[12]);}

        if(!lots || lots<=0) return;

        trades.push({
          id:             'imp_'+cells[1]+'_'+broker,
          instrument:     symToName(sym),
          idx:            symToIdx(sym),
          symbol:         sym,
          direction:      type.includes('buy') ? 'BUY' : 'SELL',
          lots,
          open:           openP,
          close:          closeP,
          date:           parseDate(cells[0]),
          pnl:            parseFloat((profit+comm+swap).toFixed(2)),
          src:            'import',
          broker,
          accountBalance,
        });
      });
    });

    return trades.filter(t => t.date && !isNaN(t.pnl));
  }

  _parseCSV(text, broker) {
    const lines  = text.split(/\r?\n/).filter(l => l.trim());
    const trades = [];
    let hdrIdx   = -1;
    let headers  = [];

    for(let i=0; i<lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if(lower.includes('ticket')||lower.includes('symbol')) {
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

    for(let i=hdrIdx+1; i<lines.length; i++) {
      const row = lines[i].split(/[,;\t]/).map(c => c.replace(/"/g,'').trim());
      if(row.length < 5) continue;
      const sym = col(row,['symbol','instrument','pair']);
      if(!sym || sym.toLowerCase()==='balance' || sym.toLowerCase()==='deposit') continue;
      const pnl  = parseFloat(col(row,['profit','p/l','pnl','net']).replace(/[^\d.-]/g,'')) || 0;
      const lots = parseFloat(col(row,['lots','volume','size','qty']).replace(/[^\d.-]/g,'')) || 1;
      const type = col(row,['type','action']).toLowerCase();
      trades.push({
        id:        'imp_'+(col(row,['ticket','order','id'])||i)+'_'+broker,
        instrument: symToName(sym),
        idx:        symToIdx(sym),
        direction:  type.includes('buy')?'BUY':'SELL',
        lots,
        open:       parseFloat(col(row,['open price','open']).replace(/[^\d.-]/g,'')) || 0,
        close:      parseFloat(col(row,['close price','close']).replace(/[^\d.-]/g,'')) || 0,
        date:       parseDate(col(row,['open time','date','time'])),
        pnl,
        src:        'import',
        broker,
      });
    }
    return trades.filter(t => t.date && !isNaN(t.pnl));
  }

  async _parsePDF(file, statusId, fromLogin) {
    const status = document.getElementById(statusId);
    if(status) { status.style.display='block'; status.className='import-status info'; status.textContent='Reading PDF...'; }

    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let allLines = [];

      for(let p=1; p<=pdf.numPages; p++) {
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
          if(line.trim()) allLines.push(line.trim());
        });
      }

      // Try to parse trades — PDFs with individual rows
      const parsed = this._parsePDFLines(allLines, this.selectedBroker);
      if(!parsed.length) {
        if(status) { status.className='import-status err'; status.innerHTML='Summary PDF detected — no individual trades found.<br>Use <strong>Save as Report (HTML)</strong> or <strong>Export to Spreadsheet (CSV)</strong> from MT5.'; }
        return;
      }

      const { added, dupes } = this._mergeTrades(parsed);
      if(status) { status.className='import-status ok'; status.textContent=`${added} trades imported from PDF${dupes?' · '+dupes+' skipped':''}`; }
      updateImportBadge();
      refresh();
      if(fromLogin) setTimeout(() => window.app.skipLogin(), 1200);

    } catch(err) {
      if(status) { status.className='import-status err'; status.textContent='PDF error: '+err.message+'. Try CSV or HTML instead.'; }
    }
  }

  _parsePDFLines(lines, broker) {
    const trades = [];
    for(let i=0; i<lines.length; i++) {
      const line = lines[i];
      const m    = line.match(/^(\d{6,12})\s+(\d{4}\.\d{2}\.\d{2})\s+[\d:]+\s+(buy|sell)\s+([\d.]+)\s+(.+?)\s+([\d.]+).*?(-?[\d.\s]+)$/i);
      if(m) {
        const sym = m[5].trim();
        trades.push({
          id:         'pdf_'+m[1]+'_'+broker,
          instrument: symToName(sym),
          idx:        symToIdx(sym),
          direction:  m[3].toUpperCase(),
          lots:       parseFloat(m[4]),
          open:       parseFloat(m[6]),
          close:      0,
          date:       m[2].replace(/\./g,'-').slice(0,10),
          pnl:        parseFloat(m[8].replace(/\s/g,'')),
          src:        'import',
          broker,
        });
      }
    }
    return trades;
  }

  // Import panel HTML
  renderPanel() {
    const BROKERS = ['FTMO','The5ers','Deriv Real','Deriv Demo','Other'];
    return `
      <div class="import-panel-box">
        <button onclick="window.app.hideImportPanel()" style="position:absolute;top:12px;right:12px;background:var(--surface2);border:none;color:var(--muted);cursor:pointer;border-radius:6px;padding:3px 9px;font-size:17px;">✕</button>
        <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;margin-bottom:6px;">MT5 Trade Import</div>
        <p style="font-size:10px;color:var(--muted);margin-bottom:16px;line-height:1.7;">Import from FTMO, The5ers, or any MT5 broker. Duplicates are skipped automatically.</p>
        <div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Select Broker</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;" id="panelBrokerBtns">
          ${BROKERS.map(b=>`<button class="broker-btn ${b===this.selectedBroker?'active':''}" data-broker="${b}">${b}</button>`).join('')}
        </div>
        <div class="import-status" id="panelStatus"></div>
        <div class="drop-zone" id="panelDropZone">
          <input type="file" id="panelFileInput" accept=".csv,.htm,.html,.pdf">
          <div class="drop-icon">📂</div>
          <div class="drop-text"><strong>Click or drag & drop</strong><br>HTML · CSV · PDF</div>
        </div>
        ${state.importHistory.length ? `
          <div style="margin-top:14px;">
            <div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Import History</div>
            <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;max-height:130px;overflow-y:auto;">
              ${state.importHistory.map(h=>`
                <div class="import-item">
                  <div>
                    <span class="broker-tag ${h.broker==='FTMO'?'ftmo':h.broker==='The5ers'?'five':'deriv'}">${h.broker}</span>
                    <span style="margin-left:6px;">${h.added} trades · ${h.date}</span>
                  </div>
                  <button class="import-del" data-delimport="${h.broker}">✕</button>
                </div>`).join('')}
            </div>
          </div>` : ''}
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:14px;font-size:10px;color:var(--muted);line-height:1.9;">
          <strong style="color:var(--text);">How to export from MT5</strong><br>
          History tab → Right-click → <strong>All History</strong> → Right-click → <strong>Report</strong> → Save as HTML
        </div>
      </div>`;
  }

  bindPanel() {
    // Broker buttons
    document.querySelectorAll('#panelBrokerBtns .broker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#panelBrokerBtns .broker-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedBroker = btn.dataset.broker;
      });
    });

    // File input
    document.getElementById('panelFileInput')?.addEventListener('change', e => {
      this.handleFile(e.target.files[0], 'panelStatus', false);
    });

    // Drop zone
    const zone = document.getElementById('panelDropZone');
    zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone?.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone?.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); this.handleFile(e.dataTransfer.files[0], 'panelStatus', false); });

    // Delete imports
    document.querySelectorAll('[data-delimport]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteImport(btn.dataset.delimport));
    });
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
}
