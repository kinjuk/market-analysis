// Dev-only worst-case data. Loaded only when the URL has ?dev (e.g. ?dev=1&data=worst). Never reached by normal visitors.
const weekdays = (n) => { const out = []; for (let d = Date.UTC(2012, 0, 2); out.length < n; d += 86400000) { const w = new Date(d).getUTCDay(); if (w && w < 6) out.push(new Date(d).toISOString().slice(0, 10)) } return out }
const N = 3300
const dates = weekdays(N)
const idx = Array.from({ length: N }, (_, i) => i)
const wave = (i, a = 4, p = 300) => 18 + a * Math.sin(i / p)

export function worst(cache, parseSeries) {
  const put = (name, px, pe, n = N) => cache.set(name, parseSeries({ dates: dates.slice(0, n), adj_close: px.slice(0, n), pe: pe ? pe.slice(0, n) : null }))
  // earnings collapse: P/E spikes to 1,500, a year of negative EPS (no P/E), a -92% crash and an 8x rebound
  put('XTREMEPE.ABC', idx.map((i) => 100 * (1 + 0.3 * Math.sin(i / 90)) * (i > 1500 && i < 1560 ? 0.08 : 1) * (i > 2500 ? 8 : 1)),
    idx.map((i) => (i >= 800 && i < 1100 ? null : i >= 1700 && i < 1740 ? 1500 : wave(i))))
  put('FLAT', idx.map(() => 50), idx.map(() => 20))                                           // zero volatility, zero trades
  put('ONETRADE', idx.map((i) => 100 + i * 0.05), idx.map((i) => (i < 1500 ? 20 : i < 1540 ? 17 : 17 + (i - 1540) * 0.008)))
  put('SHORT', idx.map((i) => 50 + i * 0.01), idx.map((i) => wave(i)), 400)                    // too little history for a 5-year average
  put('PENNY.OLDCO', idx.map((i) => 0.0004 * (1 + 0.2 * Math.sin(i / 50))), idx.map((i) => wave(i, 3, 200)))
  put('DEMO-BENCH', idx.map((i) => 100 * Math.exp(i * 0.0003)), null)
  const t = (ticker) => ({ ticker, eps_source: 'yahoo', first_pe: dates[0], last_pe: dates.at(-1) })
  return { tickers: ['XTREMEPE.ABC', 'FLAT', 'ONETRADE', 'SHORT', 'PENNY.OLDCO'].map(t).concat({ ticker: 'DEMO-BENCH', eps_source: 'none', first_pe: null }) }
}

export function mountToggle(current) {
  const bar = document.createElement('div')
  bar.id = 'devbar'
  bar.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);transform:translateX(-50%);z-index:9;display:flex;gap:2px;padding:3px;border-radius:9px;background:#d4d4d4;font:12px system-ui'
  for (const [k, label] of [['demo', 'Demo data'], ['worst', 'Worst case'], ['empty', 'Empty']]) {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = `border:0;border-radius:7px;padding:5px 10px;cursor:pointer;color:#111;background:${k === current ? '#fff' : 'transparent'}`
    b.onclick = () => { const p = new URLSearchParams(location.search); p.set('dev', '1'); p.set('data', k); location.search = p.toString() }
    bar.append(b)
  }
  document.body.append(bar)
}
