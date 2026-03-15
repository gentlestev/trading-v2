// ============================================================
// HELP DRAWER COMPONENT
// ============================================================

export function renderHelp() {
  const drawer  = document.getElementById('helpDrawer');
  const overlay = document.getElementById('helpOverlay');
  if(!drawer) return;

  drawer.classList.remove('hidden');
  overlay.classList.remove('hidden');

  drawer.innerHTML = `
    <div style="padding:24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
      <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;">? Help & Guide</div>
      <button onclick="window.app.closeHelp()"
        style="background:var(--surface2);border:none;color:var(--muted);cursor:pointer;border-radius:6px;padding:4px 10px;font-size:16px;">✕</button>
    </div>

    <div style="padding:20px;overflow-y:auto;max-height:calc(100vh - 80px);">

      <!-- Quick Start -->
      <div style="margin-bottom:22px;">
        <div style="font-size:10px;color:var(--green);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">🚀 Quick Start</div>
        ${[
          ['Import MT5 trades', 'Click the <strong style="color:var(--green)">MT5 Import</strong> badge in the header, or use the import button on the login screen. Drop your MT5 HTML/CSV/PDF file and your trades load instantly.'],
          ['Connect Deriv API', 'Go to Login screen → Deriv API tab. Paste your token from app.deriv.com/account/api-token. Scopes needed: Read + Trading information.'],
          ['Switch accounts', 'Use the account bar below the header to switch between All, FTMO, The5ers, Deriv etc. Each shows separate stats.'],
        ].map(([title, desc]) => `
          <div style="margin-bottom:12px;padding:12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">
            <div style="font-size:11px;font-weight:700;margin-bottom:4px;">${title}</div>
            <div style="font-size:10px;color:var(--muted);line-height:1.7;">${desc}</div>
          </div>`).join('')}
      </div>

      <!-- Pages Guide -->
      <div style="margin-bottom:22px;">
        <div style="font-size:10px;color:var(--green);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">📋 Pages</div>
        ${[
          ['Overview', 'Your main dashboard. Shows KPI cards, equity curve, daily P&L, instrument breakdown and monthly performance.'],
          ['Live', 'Live Deriv positions and Myfxbook sync panel. Shows open trades and recently closed trades feed.'],
          ['History', 'Full trade table with filters by range, outcome, instrument and direction. Click any row for trade details.'],
          ['Journal', 'Log your trades with setup notes, reflections, mistakes, lessons, mood and chart screenshots.'],
          ['Charts', 'Deep analysis — win/loss breakdown, P&L by instrument, full equity curve, and day-of-week performance.'],
          ['Calendar', 'Monthly calendar view showing your daily P&L at a glance. Green = profit day, Red = loss day.'],
        ].map(([page, desc]) => `
          <div style="display:flex;gap:10px;margin-bottom:10px;padding:10px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">
            <div style="font-size:10px;font-weight:700;color:var(--green);width:70px;flex-shrink:0;padding-top:1px;">${page}</div>
            <div style="font-size:10px;color:var(--muted);line-height:1.7;">${desc}</div>
          </div>`).join('')}
      </div>

      <!-- MT5 Export Guide -->
      <div style="margin-bottom:22px;">
        <div style="font-size:10px;color:var(--gold);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">📂 How to Export from MT5</div>
        <div style="background:var(--surface2);border:1px solid rgba(240,180,41,0.2);border-radius:10px;padding:14px;">
          ${[
            'Open MT5 → press <strong>Ctrl+T</strong> to open Terminal',
            'Click the <strong>History</strong> tab at the bottom',
            'Right-click anywhere → <strong>All History</strong>',
            'Right-click again → <strong>Report</strong>',
            'Save as <strong>HTML</strong> (not PDF)',
            'Drop the file into the dashboard import panel',
          ].map((step, i) => `
            <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;">
              <span style="width:20px;height:20px;border-radius:50%;background:var(--gold);color:#000;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</span>
              <span style="font-size:10px;color:var(--muted);line-height:1.8;">${step}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- Keyboard Shortcuts -->
      <div style="margin-bottom:22px;">
        <div style="font-size:10px;color:var(--purple);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">⌨️ Keyboard Shortcuts</div>
        <div style="background:var(--surface2);border-radius:8px;border:1px solid var(--border);overflow:hidden;">
          ${[
            ['Esc', 'Close modals / lightbox / help'],
            ['← →', 'Navigate lightbox images'],
            ['Ctrl+T', 'Open MT5 Terminal (in MT5)'],
          ].map(([key, desc]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);font-size:10px;">
              <span style="font-family:'JetBrains Mono',monospace;background:var(--surface);padding:2px 8px;border-radius:4px;border:1px solid var(--border);color:var(--green);">${key}</span>
              <span style="color:var(--muted);">${desc}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- Tips -->
      <div style="margin-bottom:22px;">
        <div style="font-size:10px;color:var(--blue);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">💡 Tips</div>
        ${[
          'Re-import anytime — duplicates are automatically skipped',
          'Paste chart screenshots directly into journal entries with Ctrl+V',
          'Click any trade row in History to see full details and add a journal note',
          'The equity curve starting balance is auto-calculated from your imported account balance',
          'Use the account switcher to compare performance across brokers',
        ].map(tip => `
          <div style="display:flex;gap:8px;margin-bottom:8px;font-size:10px;color:var(--muted);line-height:1.7;">
            <span style="color:var(--blue);flex-shrink:0;">→</span>
            <span>${tip}</span>
          </div>`).join('')}
      </div>

      <div style="text-align:center;padding:14px;background:var(--surface2);border-radius:8px;font-size:10px;color:var(--muted);">
        Trading Journal v2 · Built for serious prop traders
      </div>
    </div>
  `;
}
