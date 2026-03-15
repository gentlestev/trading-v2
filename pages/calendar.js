// ============================================================
// CALENDAR PAGE
// ============================================================
import { allTrades, state } from '../js/app.js';

export function renderCalendar(container) {
  const trades = allTrades();
  const m = {};
  trades.forEach(t => { m[t.date] = (m[t.date]||0) + t.pnl; });

  const dates = Object.keys(m).sort();
  if(!dates.length) {
    container.innerHTML = '<div class="empty">No trade data to display</div>';
    return;
  }

  const months = [...new Set(dates.map(d => d.slice(0,7)))];
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  let html = '';
  months.sort().forEach(ym => {
    const [y, mo] = ym.split('-').map(Number);
    const label   = new Date(y, mo-1, 1).toLocaleString('default', { month:'long', year:'numeric' });
    const first   = new Date(y, mo-1, 1).getDay();
    const total   = new Date(y, mo, 0).getDate();

    html += `<div class="cal-month"><div class="cal-month-title">${label}</div><div class="cal-grid">`;
    days.forEach(d => { html += `<div class="cal-day-label">${d}</div>`; });
    for(let i=0; i<first; i++) html += `<div class="cal-day empty"></div>`;
    for(let d=1; d<=total; d++) {
      const ds  = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const pnl = m[ds];
      const cls = pnl === undefined ? '' : pnl > 0 ? 'profit' : 'loss';
      html += `<div class="cal-day ${cls}" title="${ds}${pnl!==undefined?' · '+(pnl>0?'+':'')+'$'+Math.abs(pnl).toFixed(0):''}">
        <div class="cal-day-num">${d}</div>
        ${pnl!==undefined ? `<div class="cal-day-pnl" style="color:${pnl>0?'var(--green)':'var(--red)'}">${pnl>0?'+':''}$${Math.abs(pnl).toFixed(0)}</div>` : ''}
      </div>`;
    }
    html += `</div></div>`;
  });

  container.innerHTML = html;
}
