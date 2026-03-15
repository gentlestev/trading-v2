// ============================================================
// UTILS — shared helper functions
// ============================================================

export function parseDate(str) {
  if(!str) return new Date().toISOString().slice(0,10);
  const clean = str.trim();
  let m = clean.match(/(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})/);
  if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = clean.match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})/);
  if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const d = new Date(clean);
  if(!isNaN(d)) return d.toISOString().slice(0,10);
  return new Date().toISOString().slice(0,10);
}

export function symToIdx(sym) {
  const s = sym.toUpperCase().replace(/\s/g,'');
  if(s.includes('R_10')  ||s.includes('1HZ10') ||s.includes('VOL10') ||s==='V10') return 'V10';
  if(s.includes('R_25')  ||s.includes('1HZ25') ||s.includes('VOL25') ||s==='V25') return 'V25';
  if(s.includes('R_50')  ||s.includes('1HZ50') ||s.includes('VOL50') ||s==='V50') return 'V50';
  if(s.includes('R_75')  ||s.includes('1HZ75') ||s.includes('VOL75') ||s==='V75') return 'V75';
  if(s.includes('R_100') ||s.includes('1HZ100')||s.includes('VOL100')||s==='V100') return 'V100';
  if(s.length === 6 && /^[A-Z]+$/.test(s)) return s;
  if(s.includes('BTC')||s.includes('ETH')||s.includes('XAU')||s.includes('XAG')) return s.slice(0,6);
  return s.slice(0,6) || 'OTHER';
}

export function symToName(sym) {
  const idx = symToIdx(sym);
  const names = {
    V10:'Volatility 10 Index', V25:'Volatility 25 Index',
    V50:'Volatility 50 Index', V75:'Volatility 75 Index', V100:'Volatility 100 Index',
  };
  return names[idx] || sym;
}

export function formatMoney(n, d=2) {
  return n >= 0 ? `+$${Math.abs(n).toFixed(d)}` : `-$${Math.abs(n).toFixed(d)}`;
}

export function formatK(n) {
  const abs = Math.abs(n);
  const val = abs >= 1000 ? (abs/1000).toFixed(1)+'K' : abs.toFixed(0);
  return (n >= 0 ? '+$' : '-$') + val;
}

export function debounce(fn, ms=200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Chart.js default options
export const CHART_DEFAULTS = {
  tooltip: {
    backgroundColor: '#0f1117',
    borderColor: '#1c2032',
    borderWidth: 1,
  },
  ticks: { color: 'rgba(232,234,240,0.8)', font: { size: 9 } },
  grid:  { color: 'rgba(28,32,50,0.8)' },
};
