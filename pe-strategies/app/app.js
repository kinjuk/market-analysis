import { halves, parseSeries, rollingAvg, run, sensitivity, tradeStats, universe } from './engine.js'
import { cleanName, mergeUpload, parseCsv } from './upload.js'
import { DEFAULT_STATE, decodeState, encodeState, heatColor, plateau, plural, toCsv } from './ui-state.js'

const $ = (id) => document.getElementById(id)
const cache = new Map()
const avgCache = new Map()
const SL = { W: 'lookbackYears', en: 'entry', ex: 'exitMult', cost: 'costBps', delay: 'delayDays' }
const FMT = { lookbackYears: (v) => `${v}y`, entry: (v) => `${v.toFixed(2)}×`, exitMult: (v) => `${v.toFixed(2)}×`, costBps: (v) => `${v} bps`, delayDays: (v) => `${v} close${v === 1 ? '' : 's'}` }
const ENTRIES = [0.85, 0.9, 0.95, 1.0, 1.05]
const EXITS = [1.1, 1.15, 1.2, 1.3, 1.4]
const SRC = { sec: 'SEC EPS', yahoo: 'Yahoo EPS', 'shiller-proxy': 'S&P 500 proxy', uploaded: 'Your data', demo: 'Demo data' }
const UP_KEY = 'pe-uploads'
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`
const signed = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
const cum = (r) => { let c = 1; return Array.from(r, (x) => (c *= 1 + x)) }
const cap = (a) => { const v = Array.from(a).filter((x) => x === x).sort((p, q) => p - q); return v[Math.floor(v.length * 0.95)] * 1.5 }
let manifest, state, demo = false, seq = 0, raf = 0, uniTimer = 0, lastRes, cleared = null

// ---------- data ----------
async function loadManifest() {
  try {
    const r = await fetch('data/index.json')
    if (!r.ok) throw new Error('missing')
    return await r.json()
  } catch { return null }
}
async function loadSeries(t) {
  if (!cache.has(t)) {
    const r = await fetch(`data/${encodeURIComponent(t)}.json`)
    if (!r.ok) throw new Error(`No data file for ${t}`)
    cache.set(t, parseSeries(await r.json()))
  }
  return cache.get(t)
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function makeDemo() {
  const rnd = mulberry(7)
  const norm = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.SQRT1_2 }
  const dates = []
  for (let d = Date.UTC(2012, 0, 2); dates.length < 3300; d += 86400000) { const w = new Date(d).getUTCDay(); if (w && w < 6) dates.push(new Date(d).toISOString().slice(0, 10)) }
  let noise = 0, a = 100, b = 100
  const pe = [], px = [], bx = []
  dates.forEach((_, i) => { noise = 0.995 * noise + 0.3 * norm(); pe.push(Math.max(6, 18 + 4 * Math.sin(i / 400) + noise)); a *= Math.exp(4e-4 + 0.014 * norm()); b *= Math.exp(4e-4 + 0.01 * norm()); px.push(a); bx.push(b) })
  cache.set('DEMO', parseSeries({ dates, adj_close: px, pe }))
  cache.set('DEMO-BENCH', parseSeries({ dates, adj_close: bx, pe: null }))
  return { tickers: [{ ticker: 'DEMO', eps_source: 'demo', first_pe: dates[0], last_pe: dates.at(-1) }, { ticker: 'DEMO-BENCH', eps_source: 'none', first_pe: null }] }
}

// ---------- uploads ----------
function register(name, json) {
  cache.set(name, parseSeries(json))
  avgCache.clear()
  const ok = json.dates.filter((_, i) => json.pe[i] !== null)
  manifest.tickers = manifest.tickers.filter((t) => t.ticker !== name).concat({ ticker: name, eps_source: 'uploaded', first_pe: ok[0], last_pe: ok.at(-1), last_date: json.dates.at(-1), days: json.dates.length })
}
function fillTickers() { $('t').replaceChildren(...ctx().tickers.map((t) => Object.assign(document.createElement('option'), { value: t, textContent: t }))) }
const saved = () => { try { return JSON.parse(localStorage.getItem(UP_KEY) ?? '{}') } catch { return {} } }
async function addUpload() {
  const files = [...$('files').files]
  if (!files.length) { $('upmsg').textContent = 'Choose one or more CSV files first.'; return }
  try {
    const json = mergeUpload(await Promise.all(files.map(async (f) => parseCsv(await f.text()))))
    const name = cleanName($('upname').value || files[0].name.replace(/\.[^.]+$/, ''))
    register(name, json)
    let note = ''
    try { localStorage.setItem(UP_KEY, JSON.stringify({ ...saved(), [name]: json })) } catch { note = ' (too large to keep after closing)' }
    fillTickers(); state.ticker = name; sync(); schedule()
    $('upmsg').textContent = `${name}: ${json.dates.length} days added${note}.`
  } catch (e) { $('upmsg').textContent = e.message }
}
function clearUploads() {
  cleared = saved()
  const names = Object.keys(cleared)
  for (const n of manifest.tickers.filter((t) => t.eps_source === 'uploaded').map((t) => t.ticker).concat(names)) cache.delete(n)
  manifest.tickers = manifest.tickers.filter((t) => t.eps_source !== 'uploaded')
  avgCache.clear()
  try { localStorage.removeItem(UP_KEY) } catch {}
  fillTickers(); state.ticker = ctx().tickers[0] ?? ''; sync(); schedule()
  $('upmsg').textContent = 'Uploaded data removed.'
  if (names.length) $('upmsg').append(Object.assign(document.createElement('button'), { className: 'link', textContent: 'Undo', onclick: undoClear }))
}
function undoClear() {
  for (const [n, j] of Object.entries(cleared ?? {})) register(n, j)
  try { localStorage.setItem(UP_KEY, JSON.stringify(cleared)) } catch {}
  const first = Object.keys(cleared ?? {})[0]
  cleared = null; fillTickers(); if (first) state.ticker = first; sync(); schedule(); $('upmsg').textContent = 'Restored.'
}

// ---------- controls ----------
const ctx = () => ({ tickers: manifest.tickers.filter((t) => t.first_pe).map((t) => t.ticker), benches: manifest.tickers.map((t) => t.ticker).filter((t) => demo ? t === 'DEMO-BENCH' : ['SPY', 'QQQ'].includes(t)) })
const manifestMeta = () => manifest.tickers.find((t) => t.ticker === state.ticker)
const avgOf = (t, s, lb) => { const k = `${t}|${lb}`; if (!avgCache.has(k)) avgCache.set(k, rollingAvg(s.days, s.pe, lb)); return avgCache.get(k) }
const P = (o = {}) => ({ ...state, from: state.from || undefined, ...o })
function sync() {
  for (const [id, k] of Object.entries(SL)) { $(id).value = state[k]; $(`${id}o`).textContent = FMT[k](state[k]) }
  $('t').value = state.ticker; $('b').value = state.bench; $('from').value = state.from
  try { history.replaceState(null, '', `#${encodeState(state)}`) } catch {}
}
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update() }) }
function setTheme(t) { document.documentElement.dataset.theme = t; $('theme').textContent = t === 'dark' ? 'Light mode' : 'Dark mode'; try { localStorage.setItem('pe-theme', t) } catch {} }
function bind() {
  for (const [id, k] of Object.entries(SL)) $(id).addEventListener('input', (e) => {
    state[k] = Number(e.target.value)
    if (k === 'entry' && state.exitMult <= state.entry) state.exitMult = +(state.entry + 0.02).toFixed(2)
    if (k === 'exitMult' && state.exitMult <= state.entry) state.entry = +(state.exitMult - 0.02).toFixed(2)
    sync(); schedule()
  })
  $('t').onchange = (e) => { state.ticker = e.target.value; sync(); schedule() }
  $('b').onchange = (e) => { state.bench = e.target.value; sync(); schedule() }
  $('from').onchange = (e) => { state.from = e.target.value; sync(); schedule() }
  $('upadd').onclick = addUpload; $('upclear').onclick = clearUploads
  $('reset').onclick = () => { state = { ...DEFAULT_STATE, ticker: state.ticker, bench: state.bench }; sync(); schedule() }
  $('share').onclick = async () => { try { await navigator.clipboard.writeText(location.href); $('share').textContent = 'Link copied' } catch { $('share').textContent = 'Copy from the address bar' } setTimeout(() => ($('share').textContent = 'Copy link'), 1600) }
  $('theme').onclick = () => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); update() }
  $('csv').onclick = () => {
    if (!lastRes || lastRes.error) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toCsv(lastRes.trades, state.ticker)], { type: 'text/csv' }))
    a.download = `${state.ticker}_pe_reversion_trades.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  window.addEventListener('hashchange', () => { state = decodeState(location.hash, ctx()); sync(); schedule() })
}

// ---------- charts ----------
function chart(id,ro,x,series,o){const W=640,H=o.h||210,L=46,R=8,T=8,B=22,n=x.length,k=Math.max(1,Math.floor(n/300)),idx=[]
  for(let i=0;i<n;i+=k)idx.push(i);if(idx.at(-1)!==n-1)idx.push(n-1)
  let lo=Infinity,hi=-Infinity;for(const s of series)for(const i of idx){const v=s.y[i];if(v!==v)continue;lo=Math.min(lo,v);hi=Math.max(hi,v)}
  if(o.cap)hi=Math.min(hi,o.cap);if(o.top!==undefined)hi=Math.max(hi,o.top)
  const px=i=>L+i/(n-1)*(W-L-R),py=v=>T+(1-(Math.min(v,hi)-lo)/((hi-lo)||1))*(H-T-B)
  let g='';for(let t=0;t<4;t++){const v=lo+(hi-lo)*t/3,y=py(v);g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${L-6}" y="${y+3.5}" text-anchor="end">${o.yf(v)}</text>`}
  let last='';const yrs=[];x.forEach((d,i)=>{if(d.slice(0,4)!==last){last=d.slice(0,4);yrs.push([i,last])}});const step=Math.ceil(yrs.length/7)
  yrs.forEach(([i,y],j)=>{if(j%step===0&&i>0)g+=`<text x="${px(i)}" y="${H-6}" text-anchor="middle">${y}</text>`})
  if(o.shade)for(let i=0;i<n;){if(!o.shade[i]){i++;continue}let j=i;while(j<n&&o.shade[j])j++;g+=`<rect x="${px(i)}" y="${T}" width="${Math.max(1,px(j-1)-px(i))}" height="${H-T-B}" fill="var(--hi)" opacity=".12"/>`;i=j}
  for(const s of series){let d='',pen=false;for(const i of idx){const v=s.y[i];if(v!==v){pen=false;continue}d+=(pen?'L':'M')+px(i).toFixed(1)+' '+py(v).toFixed(1);pen=true}g+=(s.edge?`<path d="${d}" fill="none" stroke="${s.edge}" stroke-width="${(s.w||1.8)+2.6}" stroke-linejoin="round" stroke-linecap="round"/>`:'')+`<path d="${d}" fill="none" stroke="${s.c}" stroke-width="${s.w||1.8}" ${s.dash?'stroke-dasharray="5 4"':''} stroke-linejoin="round" stroke-linecap="round" opacity="${s.o||1}"/>`}
  $(id).innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img">${g}<line class="ch" y1="${T}" y2="${H-B}" stroke="var(--mut)" opacity="0"/></svg>`
  const svg=$(id).firstChild,ln=svg.querySelector('.ch'),r=$(ro)
  svg.onpointermove=e=>{const b=svg.getBoundingClientRect(),i=Math.max(0,Math.min(n-1,Math.round(((e.clientX-b.left)/(b.width||1)*W-L)/(W-L-R)*(n-1))));if(!Number.isFinite(i))return;ln.setAttribute('x1',px(i));ln.setAttribute('x2',px(i));ln.setAttribute('opacity',1);r.textContent=x[i]+' · '+o.read(i)}
  svg.onpointerleave=()=>{ln.setAttribute('opacity',0);r.textContent=''}}

// ---------- tiles ----------
const caption = (m) => { $('src').textContent = m ? `${SRC[m.eps_source] ?? m.eps_source}${m.first_pe ? ` · P/E ${m.first_pe} → ${m.last_pe}` : ''}` : '' }
const message = (t) => { $('msg').textContent = t || '' }
const showTiles = (on) => document.querySelectorAll('#app > section:not(.rules)').forEach((s) => { s.style.visibility = on ? '' : 'hidden' })
const bars = (id, v, max) => { $(id).style.width = pct(Math.max(0, v) / max, 0) }

function render(stock, bench) {
  const avg = avgOf(state.ticker, stock, state.lookbackYears)
  const res = run(stock, bench, P({ avg }))
  lastRes = res
  caption(manifestMeta()); message(res.error ? `${res.error} Try a shorter window.` : '')
  showTiles(!res.error)
  if (res.error) return
  const n = res.strat.length, T = res.trades, S = res.stats, nm = state.ticker, B = state.bench
  const ex = S.strategy.cagr - S.hold.cagr
  $('big').textContent = signed(ex); $('big').className = ex >= 0 ? 'up' : 'dn'
  $('sent').textContent = `${nm} ${ex >= 0 ? 'beat' : 'trailed'} buy-and-hold over ${(n / 252).toFixed(0)} years.`
  const cs = cum(res.strat), ch = cum(res.hold), cb = cum(res.bench), lo = Math.min(...cs, ...ch, ...cb), hi = Math.max(...cs, ...ch, ...cb)
  const sp = (a) => { const k = Math.ceil(a.length / 120); return a.filter((_, i) => i % k === 0).map((v, i, b) => `${i ? 'L' : 'M'}${((i / (b.length - 1)) * 300).toFixed(1)} ${(96 - ((v - lo) / (hi - lo)) * 90).toFixed(1)}`).join('') }
  $('ps').setAttribute('d', sp(cs)); $('pbo').setAttribute('d', sp(cb)); $('pb').setAttribute('d', sp(cb)); $('ph').setAttribute('d', sp(ch))
  $('ls').textContent = `${pct(S.strategy.cagr)}/yr`; $('lh').textContent = `${pct(S.hold.cagr)}/yr`; $('bn').textContent = B; $('lb').textContent = `${pct(S.bench.cagr)}/yr`
  // time invested + right-now meter
  $('tv').textContent = pct(res.timeInMarket, 0); $('tb').style.width = pct(res.timeInMarket, 0)
  let k = res.pe.length - 1
  while (k > 0 && Number.isNaN(res.pe[k] / res.avg[k])) k--
  const ratio = res.pe[k] / res.avg[k], stale = k < res.pe.length - 6, inv = res.pos.at(-1) === 1
  const pos = (v) => Math.max(0, Math.min(100, ((v - 0.7) / 0.7) * 100))
  $('zn').style.width = `${pos(state.entry)}%`; $('mx').style.left = `${pos(state.exitMult)}%`; $('dt').style.left = `${pos(ratio)}%`
  $('sv').textContent = stale ? 'No recent P/E' : inv ? 'Invested' : ratio < state.entry ? 'Cheap: buying soon' : 'Waiting for a dip'
  $('sc').textContent = `${stale ? `Last reading ${res.dates[k]}: ` : 'Priced '}${pct(Math.abs(ratio - 1), 0)} ${ratio < 1 ? 'below' : 'above'} its ${state.lookbackYears}-year average.`
  // trades
  const ts = tradeStats(T), wins = T.filter((t) => t.ret > 0)
  $('tn').textContent = T.length; $('tw').textContent = T.length ? `${wins.length} won` : ''
  $('td').replaceChildren(...T.slice(0, 40).map((t) => Object.assign(document.createElement('i'), { className: t.ret > 0 ? '' : 'l', title: signed(t.ret) })))
  const chips = T.length ? [[`Win rate ${pct(ts.winRate, 0)}`], [`Average trade ${signed(ts.avgTrade)}`], [`Best trade carries ${Number.isNaN(ts.bestShare) ? '–' : pct(ts.bestShare, 0)} of gains`, ts.bestShare > 0.5 && T.length > 1], ...(T.length < 5 ? [['Few trades: treat as an anecdote', true]] : [])] : [['No trades with these rules.']]
  $('tchips').replaceChildren(...chips.map(([t, f]) => Object.assign(document.createElement('span'), { className: `chip${f ? ' flag' : ''}`, textContent: t })))
  // drop + consistency
  const m1 = Math.abs(S.strategy.maxDD), m2 = Math.abs(S.hold.maxDD), mx = Math.max(m1, m2, 0.01)
  bars('d1', m1, mx); bars('d2', m2, mx); $('v1').textContent = `−${pct(m1, 0)}`; $('v2').textContent = `−${pct(m2, 0)}`
  const h = halves(res), hv = h ? [h.first.strategy.sharpe, h.second.strategy.sharpe, S.strategy.sharpe] : [0, 0, 0], hm = Math.max(...hv.map(Math.abs), 0.01)
  ;['h1', 'h2', 'h3'].forEach((id, i) => { bars(id, hv[i], hm); $(`${id}v`).textContent = h ? hv[i].toFixed(2) : '–' })
  // nearby rules + sensitivity grid
  const cells = []
  let up = 0, tot = 0
  for (const de of [-0.05, 0, 0.05]) for (const dx of [-0.1, 0, 0.1]) {
    if (!de && !dx) { cells.push('me'); continue }
    const e = state.entry + de, x = state.exitMult + dx
    if (x <= e) { cells.push('x'); continue }
    const q = run(stock, bench, P({ avg, entry: e, exitMult: x }))
    if (q.error) { cells.push('x'); continue }
    const v = q.stats.strategy.cagr - q.stats.hold.cagr > 0
    tot++; up += v; cells.push(v ? '' : 'l')
  }
  $('nb').replaceChildren(...cells.map((c) => Object.assign(document.createElement('i'), { className: c })))
  $('nc').textContent = `${up} of ${tot} nearby rules beat holding.`
  const G = sensitivity(stock, bench, P({ avg }), ENTRIES, EXITS)
  let g = '<span></span>' + EXITS.map((x) => `<span>${x.toFixed(2)}×</span>`).join('')
  ENTRIES.forEach((e, i) => {
    g += `<span>${e.toFixed(2)}×</span>` + EXITS.map((x, j) => {
      const c = G[i][j]
      if (!c) return '<button class="cell x" disabled>–</button>'
      const cur = Math.abs(e - state.entry) < 1e-9 && Math.abs(x - state.exitMult) < 1e-9
      return `<button class="cell${cur ? ' cur' : ''}" data-e="${e}" data-x="${x}" style="background:${heatColor(c.excessCagr)}" title="CAGR ${pct(c.cagr)} · Sharpe ${c.sharpe.toFixed(2)}">${c.excessCagr >= 0 ? '+' : '−'}${Math.abs(c.excessCagr * 100).toFixed(1)}<small>${plural(c.trades, 'trade')}</small></button>`
    }).join('')
  })
  $('sg').innerHTML = g
  $('sg').querySelectorAll('.cell:not(.x)').forEach((b) => (b.onclick = () => { state.entry = Number(b.dataset.e); state.exitMult = Number(b.dataset.x); sync(); schedule() }))
  const gi = ENTRIES.findIndex((v) => Math.abs(v - state.entry) < 1e-9), gj = EXITS.findIndex((v) => Math.abs(v - state.exitMult) < 1e-9)
  const pl = gi >= 0 && gj >= 0 && G[gi][gj] ? plateau(G, gi, gj) : null
  $('plat').textContent = pl ? `${pl.ahead} of ${pl.n} neighbouring cells beat holding.` : ''
  // charts, scorecard, trade list
  const x = res.dates, dd = (a) => { let p = -Infinity; return a.map((v) => (p = Math.max(p, v), v / p - 1)) }, d1 = dd(cs), d2 = dd(ch), d3 = dd(cb)
  chart('c-pe', 'ro-pe', x, [{ y: res.pe, c: 'var(--ink)' }, { y: res.avg, c: 'var(--hi)', w: 1.7 }, { y: res.avg.map((v) => v * state.exitMult), c: 'var(--hi)', w: 1.3, dash: 1, o: 0.9 }], { yf: (v) => v.toFixed(0), cap: cap(res.pe), shade: res.pos, read: (i) => `P/E ${res.pe[i].toFixed(1)} · average ${res.avg[i].toFixed(1)} · ${res.pos[i] ? 'invested' : 'in cash'}` })
  chart('c-gro', 'ro-gro', x, [{ y: cb, c: 'var(--b-fill)', edge: 'var(--b-edge)' }, { y: ch, c: 'var(--ink)' }, { y: cs, c: 'var(--hi)', w: 2.4 }], { yf: (v) => `${v.toFixed(1)}×`, read: (i) => `Strategy ${cs[i].toFixed(2)}× · ${nm} ${ch[i].toFixed(2)}× · ${B} ${cb[i].toFixed(2)}×` })
  chart('c-dd', 'ro-dd', x, [{ y: d3, c: 'var(--b-fill)', edge: 'var(--b-edge)' }, { y: d2, c: 'var(--ink)' }, { y: d1, c: 'var(--hi)', w: 2.2 }], { yf: (v) => `${(v * 100).toFixed(0)}%`, top: 0, h: 190, read: (i) => `Strategy ${pct(d1[i], 0)} · ${nm} ${pct(d2[i], 0)} · ${B} ${pct(d3[i], 0)}` })
  const SR = [['CAGR', (k) => pct(k.cagr)], ['Volatility', (k) => pct(k.vol)], ['Sharpe (rf = 0)', (k) => k.sharpe.toFixed(2)], ['Max drawdown', (k) => pct(k.maxDD)]]
  $('score').innerHTML = `<tr><th></th><th>Strategy</th><th>${esc(nm)}</th><th>${esc(B)}</th></tr>` + SR.map(([a, f]) => `<tr><td>${a}</td><td>${f(S.strategy)}</td><td>${f(S.hold)}</td><td>${f(S.bench)}</td></tr>`).join('') + `<tr><td>Time in market</td><td>${pct(res.timeInMarket, 0)}</td><td>–</td><td>–</td></tr><tr><td>Trades</td><td>${T.length}</td><td>–</td><td>–</td></tr>`
  $('trt').innerHTML = T.length ? '<tr><th>Entry</th><th>Last day held</th><th>Days</th><th>Return</th></tr>' + T.map((t) => `<tr><td>${t.entry}</td><td>${t.open ? 'still open' : t.last}</td><td>${t.days}</td><td class="${t.ret >= 0 ? 'up' : 'dn'}">${signed(t.ret)}</td></tr>`).join('') : '<tr><td>No trades with these rules.</td></tr>'
}

// ---------- all stocks (same rules on every stock) ----------
async function renderUniverse() {
  const names = ctx().tickers
  if (!names.every((t) => cache.has(t))) $('uns').textContent = 'Loading every stock…'
  await Promise.all(names.map(loadSeries))
  const bench = cache.get(state.bench)
  if (!bench) return
  const u = universe(Object.fromEntries(names.map((t) => [t, cache.get(t)])), bench, P(), (t, s) => avgOf(t, s, state.lookbackYears))
  $('rv').textContent = `${u.ahead} of ${u.total}`
  $('rp').style.strokeDashoffset = 264 * (1 - (u.total ? u.ahead / u.total : 0))
  $('uns').textContent = u.total ? `${u.ahead} of ${u.total} beat holding. Median difference ${signed(u.median)} a year.` : 'No stock has enough P/E history for these rules.'
  const pick = (t) => { state.ticker = t; sync(); schedule() }
  $('strip').replaceChildren(...u.rows.map((r) => {
    const b = document.createElement('button')
    b.className = `sc${r.ticker === state.ticker ? ' cur' : ''}`; b.innerHTML = `${esc(r.ticker)}<b>${signed(r.excess)}</b>`; b.style.background = heatColor(r.excess); b.onclick = () => pick(r.ticker)
    return b
  }))
  $('un').innerHTML = '<tr><th>Stock</th><th>vs holding</th><th>CAGR</th><th>Max drop</th><th>Trades</th></tr>' + u.rows.map((r) => `<tr><td><button class="link" data-t="${esc(r.ticker)}">${esc(r.ticker)}</button></td><td style="background:${heatColor(r.excess)}">${signed(r.excess)}</td><td>${pct(r.cagr)}</td><td>${pct(r.maxDD, 0)}</td><td>${r.trades}</td></tr>`).join('')
  $('un').querySelectorAll('button').forEach((b) => (b.onclick = () => { pick(b.dataset.t); window.scrollTo({ top: 0, behavior: 'smooth' }) }))
}
const scheduleUniverse = () => { clearTimeout(uniTimer); uniTimer = setTimeout(() => renderUniverse().catch((e) => message(e.message)), 250) }

// ---------- main ----------
async function update() {
  const mine = ++seq
  if (!state.ticker) { message('No stocks loaded yet. Add your own data below.'); showTiles(false); caption(null); return }
  try {
    const [stock, bench] = await Promise.all([loadSeries(state.ticker), loadSeries(state.bench)])
    if (mine !== seq) return
    render(stock, bench)
    scheduleUniverse()
  } catch (e) { message(e.message) }
}
async function main() {
  setTheme(document.documentElement.dataset.theme || 'light')
  const q = new URLSearchParams(location.search)
  const dev = q.has('dev') ? await import('./dev-fixtures.js') : null
  const mode = dev ? q.get('data') ?? 'demo' : 'live'
  if (mode === 'worst') { manifest = dev.worst(cache, parseSeries); demo = true } else if (mode === 'empty') { manifest = { tickers: [] }; demo = true } else manifest = await loadManifest()
  if (!manifest) { demo = true; manifest = makeDemo() }
  dev?.mountToggle(mode)
  for (const [n, j] of Object.entries(saved())) { try { register(n, j) } catch {} }
  const c = ctx()
  for (const [id, list] of [['t', c.tickers], ['b', c.benches]]) $(id).replaceChildren(...list.map((t) => Object.assign(document.createElement('option'), { value: t, textContent: t })))
  state = decodeState(location.hash, c)
  bind(); sync(); await update()
}
main()
