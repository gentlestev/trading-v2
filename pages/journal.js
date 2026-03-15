// ============================================================
// JOURNAL PAGE
// ============================================================
import { state, saveState, refresh, openLightbox, showModal } from '../js/app.js';

let editingId     = null;
let selectedStars = 0;
let selectedMoods = [];
let selectedImages= [];
let jFilter       = 'all';

export function renderJournal(container) {
  const entries = getActiveJournals();

  container.innerHTML = `
    <button class="btn btn-purple" style="margin-bottom:16px;" id="newEntryBtn">
      + New Journal Entry
    </button>
    <div id="journalFormWrap" style="display:none;margin-bottom:16px;"></div>
    <div class="kpi-grid" id="jStats" style="margin-bottom:16px;"></div>
    <div class="filter-btns" style="margin-bottom:14px;">
      <button class="rbtn active" data-jf="all">All</button>
      <button class="rbtn" data-jf="win">Wins</button>
      <button class="rbtn" data-jf="loss">Losses</button>
      <button class="rbtn" data-jf="plan">Has Plan</button>
      <button class="rbtn" data-jf="mistake">Mistakes</button>
    </div>
    <div id="jEntries"></div>
  `;

  document.getElementById('newEntryBtn').addEventListener('click', () => openJournalForm(null));

  document.querySelectorAll('[data-jf]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-jf]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      jFilter = btn.dataset.jf;
      renderEntries();
    });
  });

  renderJournalStats();
  renderEntries();
}

function getActiveJournals() {
  const acct = state.activeAcct;
  if(acct === 'all') return state.journalEntries;
  return state.journalEntries.filter(j =>
    j.account === acct ||
    (!j.account && (acct === 'hist' || acct === 'live'))
  );
}

function renderJournalStats() {
  const el      = document.getElementById('jStats');
  if(!el) return;
  const entries = getActiveJournals();
  if(!entries.length) { el.innerHTML = ''; return; }

  const wins      = entries.filter(j => j.outcome === 'win');
  const avgRating = entries.filter(j=>j.rating>0).reduce((s,j)=>s+j.rating,0) / (entries.filter(j=>j.rating>0).length||1);
  const mistakes  = entries.filter(j => j.mistake?.trim()).length;

  const acctNames = { all:'All Accounts', hist:'Deriv', live:'Deriv Live' };
  const acctLbl   = acctNames[state.activeAcct] || state.activeAcct;

  el.innerHTML = [
    { v: entries.length, l: acctLbl+' Entries' },
    { v: wins.length,    l: 'Winning Entries' },
    { v: '★'.repeat(Math.round(avgRating))+'☆'.repeat(5-Math.round(avgRating)), l:'Avg Quality' },
    { v: mistakes,       l: 'Mistakes Logged' },
  ].map(s => `
    <div class="kpi-card b">
      <div class="kpi-value b" style="font-size:15px;">${s.v}</div>
      <div class="kpi-sub">${s.l}</div>
    </div>`).join('');
}

function renderEntries() {
  const el = document.getElementById('jEntries');
  if(!el) return;

  let entries = [...getActiveJournals()];
  if(jFilter === 'win')     entries = entries.filter(j => j.outcome === 'win');
  else if(jFilter === 'loss')    entries = entries.filter(j => j.outcome === 'loss');
  else if(jFilter === 'plan')    entries = entries.filter(j => j.setup?.trim());
  else if(jFilter === 'mistake') entries = entries.filter(j => j.mistake?.trim());

  if(!entries.length) {
    el.innerHTML = '<div class="empty">No journal entries yet.<br>Click "+ New Journal Entry" to start logging your trades.</div>';
    return;
  }

  el.innerHTML = entries.map(j => `
    <div class="journal-entry">
      <div class="entry-header">
        <div>
          <div class="entry-title">${j.instrument || 'General Entry'}${j.direction ? ' · '+j.direction : ''}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:3px;">
            ${j.date}
            ${j.rating ? ` <span style="color:var(--gold)">${'★'.repeat(j.rating)}${'☆'.repeat(5-j.rating)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${j.outcome ? `<span class="entry-tag ${j.outcome}">${j.outcome==='win'?'WIN':j.outcome==='loss'?'LOSS':'BE'}</span>` : ''}
          ${j.pnl ? `<span style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:${j.pnl>0?'var(--green)':'var(--red)'}">${j.pnl>0?'+':''}$${Math.abs(j.pnl).toFixed(2)}</span>` : ''}
        </div>
      </div>
      ${j.setup      ? `<div class="entry-section"><div class="entry-section-title">Setup</div><div class="entry-body">${j.setup}</div></div>` : ''}
      ${j.reflection ? `<div class="entry-section"><div class="entry-section-title">Reflection</div><div class="entry-body">${j.reflection}</div></div>` : ''}
      ${j.mistake    ? `<div class="entry-section"><div class="entry-section-title" style="color:var(--red)">Mistake</div><div class="entry-body" style="color:rgba(255,77,106,0.85)">${j.mistake}</div></div>` : ''}
      ${j.lesson     ? `<div class="entry-section"><div class="entry-section-title" style="color:var(--gold)">Lesson</div><div class="entry-body" style="color:rgba(240,180,41,0.9)">${j.lesson}</div></div>` : ''}
      ${j.moods?.length ? `<div class="entry-moods">${j.moods.map(m=>`<span class="entry-mood">${m}</span>`).join('')}</div>` : ''}
      ${j.images?.length ? `
        <div class="entry-section">
          <div class="entry-section-title">Charts (${j.images.length})</div>
          <div class="img-grid">${j.images.map((img,i) =>
            `<img class="img-thumb" src="${img.data}" alt="Chart ${i+1}"
              data-imgopen="${j.id}" data-imgidx="${i}">`
          ).join('')}</div>
        </div>` : ''}
      <div class="entry-actions">
        <button class="btn btn-sm btn-secondary" data-edit="${j.id}">Edit</button>
        <button class="btn btn-sm btn-red"       data-del="${j.id}">Delete</button>
      </div>
    </div>`).join('');

  // Bind actions
  el.addEventListener('click', e => {
    const editId = e.target.closest('[data-edit]')?.dataset.edit;
    const delId  = e.target.closest('[data-del]')?.dataset.del;
    const imgEl  = e.target.closest('[data-imgopen]');
    if(editId) { e.stopPropagation(); openJournalForm(null, editId); }
    if(delId)  { e.stopPropagation(); deleteEntry(delId); }
    if(imgEl)  {
      const entry = state.journalEntries.find(j => j.id === imgEl.dataset.imgopen);
      if(entry?.images) openLightbox(entry.images.map((img,k) => ({ src:img.data, caption:`Chart ${k+1}` })), parseInt(imgEl.dataset.imgidx));
    }
  });
}

export function openJournalForm(tradeId=null, existingId=null) {
  const wrap    = document.getElementById('journalFormWrap');
  if(!wrap) return;
  const existing = existingId ? state.journalEntries.find(j => j.id === existingId) : null;
  editingId      = existingId || null;
  selectedStars  = existing?.rating || 0;
  selectedMoods  = existing?.moods  ? [...existing.moods] : [];
  selectedImages = existing?.images ? [...existing.images] : [];

  // Find trade for pre-fill
  const allT = [...state.liveTrades, ...state.importedTrades];
  const trade = tradeId ? allT.find(t => t.id === tradeId) : null;

  const MOODS = ['Frustrated','Anxious','Confident','Calm','Focused','Tired','Greedy','FOMO','Disciplined'];
  const INSTRUMENTS = ['Volatility 10 Index','Volatility 25 Index','Volatility 50 Index','Volatility 75 Index','Volatility 100 Index'];

  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div class="journal-form">
      <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:var(--green);margin-bottom:14px;">
        ${existing ? 'Edit Entry' : 'New Journal Entry'}
      </div>
      <input type="hidden" id="jTradeId" value="${tradeId || existing?.tradeId || ''}">
      <div class="form-row">
        <div><div class="form-label">Date</div>
          <input type="date" class="form-input" id="jDate" value="${existing?.date || new Date().toISOString().slice(0,10)}"></div>
        <div><div class="form-label">Instrument</div>
          <select class="form-input" id="jInstrument">
            <option value="">— General —</option>
            ${INSTRUMENTS.map(i=>`<option value="${i}" ${(existing?.instrument===i||trade?.instrument===i)?'selected':''}>${i}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div><div class="form-label">Direction</div>
          <select class="form-input" id="jDirection">
            <option value="">— Any —</option>
            <option value="BUY"  ${existing?.direction==='BUY' ||trade?.direction==='BUY' ?'selected':''}>BUY</option>
            <option value="SELL" ${existing?.direction==='SELL'||trade?.direction==='SELL'?'selected':''}>SELL</option>
          </select></div>
        <div><div class="form-label">Outcome</div>
          <select class="form-input" id="jOutcome">
            <option value="win"       ${existing?.outcome==='win'       ||(trade&&trade.pnl>0)?'selected':''}>Win</option>
            <option value="loss"      ${existing?.outcome==='loss'      ||(trade&&trade.pnl<0)?'selected':''}>Loss</option>
            <option value="breakeven" ${existing?.outcome==='breakeven'?'selected':''}>Break Even</option>
          </select></div>
      </div>
      <div class="form-row">
        <div><div class="form-label">P/L Amount ($)</div>
          <input type="number" class="form-input" id="jPnl" placeholder="e.g. 1221.53" value="${existing?.pnl||trade?.pnl||''}"></div>
        <div><div class="form-label">Session Quality</div>
          <div class="stars" id="starRow">
            ${[1,2,3,4,5].map(i=>`<span class="star ${selectedStars>=i?'active':''}" data-star="${i}">★</span>`).join('')}
          </div></div>
      </div>
      <div style="margin-bottom:12px;">
        <div class="form-label">Setup / Reason for Entry</div>
        <textarea class="form-input" id="jSetup" placeholder="What did you see? What was the setup?">${existing?.setup||''}</textarea>
      </div>
      <div style="margin-bottom:12px;">
        <div class="form-label">Reflection</div>
        <textarea class="form-input" id="jReflection" placeholder="How did it go? Did it follow your plan?">${existing?.reflection||''}</textarea>
      </div>
      <div style="margin-bottom:12px;">
        <div class="form-label">Mistake (if any)</div>
        <textarea class="form-input" style="min-height:60px;" id="jMistake" placeholder="What went wrong?">${existing?.mistake||''}</textarea>
      </div>
      <div style="margin-bottom:12px;">
        <div class="form-label">Lesson Learned</div>
        <textarea class="form-input" style="min-height:60px;" id="jLesson" placeholder="Key takeaway for next time">${existing?.lesson||''}</textarea>
      </div>
      <div style="margin-bottom:12px;">
        <div class="form-label">Emotional State</div>
        <div class="mood-btns" id="moodBtns">
          ${MOODS.map(m=>`<button class="mood-btn ${selectedMoods.includes(m)?'active':''}" data-mood="${m}">${m}</button>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <div class="form-label">Chart Screenshots</div>
        <div class="img-upload-zone" id="imgZone">
          <input type="file" id="imgInput" accept="image/*" multiple>
          <div style="font-size:11px;color:var(--muted)"><strong style="color:var(--green)">Click or drag</strong> to upload charts · Or paste with Ctrl+V</div>
        </div>
        <div class="img-previews" id="imgPreviews"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="btn btn-primary" id="saveEntryBtn">Save Entry</button>
        <button class="btn btn-secondary" id="cancelEntryBtn">Cancel</button>
      </div>
    </div>`;

  // Stars
  wrap.querySelectorAll('.star').forEach(s => {
    s.addEventListener('click', () => {
      selectedStars = parseInt(s.dataset.star);
      wrap.querySelectorAll('.star').forEach((st,i) => st.classList.toggle('active', i < selectedStars));
    });
  });

  // Moods
  wrap.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mood;
      if(selectedMoods.includes(m)) { selectedMoods = selectedMoods.filter(x=>x!==m); btn.classList.remove('active'); }
      else { selectedMoods.push(m); btn.classList.add('active'); }
    });
  });

  // Images
  wrap.querySelector('#imgInput').addEventListener('change', e => handleImages(e.target.files));
  const zone = wrap.querySelector('#imgZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleImages(e.dataTransfer.files); });
  document.addEventListener('paste', handlePaste);

  renderImgPreviews();

  // Save / Cancel
  wrap.querySelector('#saveEntryBtn').addEventListener('click', saveEntry);
  wrap.querySelector('#cancelEntryBtn').addEventListener('click', cancelForm);

  // Scroll to form
  wrap.scrollIntoView({ behavior:'smooth', block:'start' });
}

function handleImages(files) {
  [...files].forEach(f => {
    if(!f.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = e => { selectedImages.push({ data:e.target.result, name:f.name }); renderImgPreviews(); };
    r.readAsDataURL(f);
  });
}

function handlePaste(e) {
  const items = e.clipboardData?.items || [];
  [...items].forEach(item => {
    if(!item.type.startsWith('image/')) return;
    const f = item.getAsFile();
    const r = new FileReader();
    r.onload = ev => { selectedImages.push({ data:ev.target.result, name:'pasted.png' }); renderImgPreviews(); };
    r.readAsDataURL(f);
  });
}

function renderImgPreviews() {
  const el = document.getElementById('imgPreviews');
  if(!el) return;
  el.innerHTML = selectedImages.map((img,i) => `
    <div class="img-preview-wrap">
      <img src="${img.data}" alt="Chart ${i+1}">
      <button class="img-del" data-rmimg="${i}">✕</button>
    </div>`).join('');
  el.querySelectorAll('[data-rmimg]').forEach(btn => {
    btn.addEventListener('click', () => { selectedImages.splice(parseInt(btn.dataset.rmimg),1); renderImgPreviews(); });
  });
}

function saveEntry() {
  const entry = {
    id:         editingId || 'j_' + Date.now(),
    tradeId:    document.getElementById('jTradeId')?.value || null,
    date:       document.getElementById('jDate')?.value,
    instrument: document.getElementById('jInstrument')?.value,
    direction:  document.getElementById('jDirection')?.value,
    outcome:    document.getElementById('jOutcome')?.value,
    pnl:        parseFloat(document.getElementById('jPnl')?.value) || 0,
    setup:      document.getElementById('jSetup')?.value?.trim(),
    reflection: document.getElementById('jReflection')?.value?.trim(),
    mistake:    document.getElementById('jMistake')?.value?.trim(),
    lesson:     document.getElementById('jLesson')?.value?.trim(),
    rating:     selectedStars,
    moods:      [...selectedMoods],
    images:     [...selectedImages],
    savedAt:    new Date().toISOString(),
    account:    state.activeAcct,
  };

  if(editingId) {
    const i = state.journalEntries.findIndex(j => j.id === editingId);
    if(i >= 0) state.journalEntries[i] = entry;
  } else {
    state.journalEntries.unshift(entry);
  }

  saveState();
  cancelForm();
  renderJournalStats();
  renderEntries();
}

function cancelForm() {
  const wrap = document.getElementById('journalFormWrap');
  if(wrap) wrap.style.display = 'none';
  editingId = null; selectedStars = 0; selectedMoods = []; selectedImages = [];
  document.removeEventListener('paste', handlePaste);
}

function deleteEntry(id) {
  if(!confirm('Delete this journal entry?')) return;
  state.journalEntries = state.journalEntries.filter(j => j.id !== id);
  saveState();
  renderJournalStats();
  renderEntries();
}
