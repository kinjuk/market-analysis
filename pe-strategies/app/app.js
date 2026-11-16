import { halves, parseSeries, run, sensitivity, tradeStats, universe } from './engine.js'
import { mergeUpload, parseCsv, cleanName } from './upload.js'
import { DEFAULT_STATE, decodeState, encodeState, heatColor, plateau, plural, toCsv } from './ui-state.js'

const $ = (id) => document.getElementById(id)
const cache = new Map()
const plots = {}
const SLIDERS = ['lookbackYears', 'entry', 'exitMult', 'costBps', 'delayDays']
const ENTRIES = [0.85, 0.9, 0.95, 1.0, 1.05]
const EXITS = [1.1, 1.15, 1.2, 1.3, 1.4]
const SRC = { sec: 'SEC EPS', yahoo: 'Yahoo EPS', 'shiller-proxy': 'S&P 500 proxy', uploaded: 'Your data', demo: 'Demo data' }
const UP_KEY = 'pe-uploads'
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
let manifest, state, demo = false, seq = 0, raf = 0, gridTimer = 0, lastRes, uniOn = false, uniTimer = 0, cleared = null
const signed = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`

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
  const ok = json.dates.filter((_, i) => json.pe[i] !== null)
  manifest.tickers = manifest.tickers.filter((t) => t.ticker !== name).concat({ ticker: name, eps_source: 'uploaded', first_pe: ok[0], last_pe: ok.at(-1), last_date: json.dates.at(-1), days: json.dates.length })
}
function fillTickers() { $('ticker').replaceChildren(...ctx().tickers.map((t) => Object.assign(document.createElement('option'), { value: t, textContent: t }))) }
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
function sync() {
  for (const k of SLIDERS) { $(k).value = state[k]; $(`o-${k}`).textContent = k === 'lookbackYears' ? `${state[k]}y` : k === 'entry' || k === 'exitMult' ? state[k].toFixed(2) : state[k] }
  $('ticker').value = state.ticker; $('bench').value = state.bench; $('from').value = state.from
  history.replaceState(null, '', `#${encodeState(state)}`)
}
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update() }) }
function bind() {
  for (const k of SLIDERS) $(k).addEventListener('input', (e) => {
    state[k] = Number(e.target.value)
    if (k === 'entry' && state.exitMult <= state.entry) state.exitMult = +(state.entry + 0.02).toFixed(2)
    if (k === 'exitMult' && state.exitMult <= state.entry) state.entry = +(state.exitMult - 0.02).toFixed(2)
    sync(); schedule()
  })
  for (const k of ['ticker', 'bench', 'from']) $(k).addEventListener('change', (e) => { state[k] = e.target.value; sync(); schedule() })
  $('upadd').onclick = addUpload; $('upclear').onclick = clearUploads
  $('uni').onclick = () => { uniOn = true; $('uni').textContent = 'Refresh'; renderUniverse().catch((e) => message(e.message)) }
  $('reset').onclick = () => { state = { ...DEFAULT_STATE, ticker: state.ticker, bench: state.bench }; sync(); schedule() }
  $('share').onclick = async () => { try { await navigator.clipboard.writeText(location.href); $('share').textContent = 'Link copied' } catch { prompt('Copy this link', location.href) } setTimeout(() => ($('share').textContent = 'Copy link'), 1500) }
  $('theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(t); update() }
  $('csv').onclick = () => {
    if (!lastRes || lastRes.error) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toCsv(lastRes.trades, state.ticker)], { type: 'text/csv' }))
    a.download = `${state.ticker}_pe_reversion_trades.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  window.addEventListener('hashchange', () => { state = decodeState(location.hash, ctx()); sync(); schedule() })
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => Object.values(plots).forEach((p) => p.u.setSize({ width: p.el.clientWidth, height: p.h })), 150) })
}
function setTheme(t) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#171011' : '#ffffff')
  if ($('theme')) $('theme').textContent = t === 'dark' ? 'Light mode' : 'Dark mode'
  try { localStorage.setItem('pe-theme', t) } catch {}
}
const ctx = () => ({ tickers: manifest.tickers.filter((t) => t.first_pe).map((t) => t.ticker), benches: manifest.tickers.map((t) => t.ticker).filter((t) => demo ? t === 'DEMO-BENCH' : ['SPY', 'QQQ'].includes(t)) })

// ---------- charts ----------
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const nn = (a) => Array.from(a, (v) => (Number.isNaN(v) ? null : v))
function mount(id, sig, h, series, data, hooks = {}, yfmt, cap) {
  const el = $(id), key = `${sig}|${document.documentElement.dataset.theme}`
  const p = plots[id]
  if (p && p.key === key) { p.cap = cap; return p.u.setData(data) }
  p?.u.destroy(); el.replaceChildren()
  const axis = { stroke: css('--mut'), grid: { stroke: css('--line'), width: 1 }, ticks: { stroke: css('--line') } }
  const rec = { key, el, h, cap }
  plots[id] = rec
  rec.u = new uPlot({ width: el.clientWidth || 600, height: h, cursor: { sync: { key: 'pe' } }, hooks,
    scales: { x: { time: true }, y: { range: (u, mn, mx) => [mn, rec.cap ? Math.min(mx, rec.cap) : mx] } },
    axes: [axis, { ...axis, values: yfmt ? (_, v) => v.map(yfmt) : undefined }], series: [{}, ...series.map((s) => ({ width: 1.5, points: { show: false }, ...s }))] }, data, el)
}
/** A few weeks of absurd P/E readings (near-zero earnings) would flatten the whole chart: cap the axis at 1.5x the 95th percentile. */
function peCap(pe) { const v = Array.from(pe).filter((x) => !Number.isNaN(x)).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length * 0.95)] * 1.5 : 0 }
function drawCharts(res, stock, bench) {
  const x = res.dates.map((d) => Date.parse(`${d}T00:00:00Z`) / 1000)
  const sig = `${state.ticker}|${state.bench}`
  const runs = []
  for (let i = 0; i < res.pos.length;) { if (res.pos[i] !== 1) { i++; continue } let j = i; while (j < res.pos.length && res.pos[j] === 1) j++; runs.push([i, j - 1]); i = j }
  const shade = { drawClear: [(u) => { const { ctx: c } = u; const { top, height } = u.bbox; c.save(); c.fillStyle = `${css('--green')}33`; for (const [i, j] of runs) { const x0 = u.valToPos(x[i], 'x', true), x1 = u.valToPos(x[j], 'x', true); c.fillRect(x0, top, Math.max(1, x1 - x0), height) } c.restore() }] }
  mount('c-pe', sig, 260, [{ label: 'P/E', stroke: css('--s1') }, { label: 'P/E average', stroke: css('--grey') }, { label: 'exit level', stroke: css('--gold'), dash: [5, 4], width: 1 }],
    [x, nn(res.pe), nn(res.avg), nn(res.avg).map((v) => (v === null ? null : v * state.exitMult))], shade, undefined, peCap(res.pe))
  const cum = (r) => { let c = 1; return Array.from(r, (v) => (c *= 1 + v)) }
  const g = [cum(res.strat), cum(res.hold), cum(res.bench)]
  mount('c-growth', sig, 300, [{ label: 'Strategy', stroke: css('--s1'), width: 2.4 }, { label: `${state.ticker} buy & hold`, stroke: css('--grey') }, { label: `${state.bench} buy & hold`, stroke: css('--gold') }], [x, ...g], {}, (v) => `${v.toFixed(1)}×`)
  const dd = g.map((c) => { let p = -Infinity; return c.map((v) => ((p = Math.max(p, v)), v / p - 1)) })
  mount('c-dd', sig, 200, [{ label: 'Strategy', stroke: css('--s1') }, { label: `${state.ticker}`, stroke: css('--grey'), width: 1 }, { label: `${state.bench}`, stroke: css('--gold'), width: 1 }], [x, ...dd], {}, (v) => `${(v * 100).toFixed(0)}%`)
}

// ---------- tables / banners ----------
function renderStats(res) {
  const rows = [['CAGR', (s) => pct(s.cagr)], ['Volatility', (s) => pct(s.vol)], ['Sharpe (rf = 0)', (s) => s.sharpe.toFixed(2)], ['Max drawdown', (s) => pct(s.maxDD)]]
  const cols = [['Strategy', res.stats.strategy], [`${state.ticker} buy & hold`, res.stats.hold], [`${state.bench} buy & hold`, res.stats.bench]]
  $('stats').innerHTML = `<table><thead><tr><th></th>${cols.map(([n]) => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(([n, f]) => `<tr><td>${n}</td>${cols.map(([, s]) => `<td>${f(s)}</td>`).join('')}</tr>`).join('') +
    extra(res) + '</tbody></table>'
}
function extra(res) {
  const ts = tradeStats(res.trades), h = halves(res), dash = '<td>–</td>'
  const sh = (s) => s.sharpe.toFixed(2)
  return `<tr><td>Time in market · trades</td><td>${pct(res.timeInMarket, 0)} · ${plural(res.trades.length, 'trade')}</td>${dash}${dash}</tr>` +
    `<tr><td>Win rate · average trade</td><td>${ts.n ? `${pct(ts.winRate, 0)} · ${pct(ts.avgTrade)}` : '–'}</td>${dash}${dash}</tr>` +
    `<tr><td>Best trade, share of gains</td><td>${Number.isNaN(ts.bestShare) ? '–' : pct(ts.bestShare, 0)}</td>${dash}${dash}</tr>` +
    `<tr><td>Sharpe, first / second half</td><td>${h ? `${sh(h.first.strategy)} / ${sh(h.second.strategy)}` : '–'}</td><td>${h ? `${sh(h.first.hold)} / ${sh(h.second.hold)}` : '–'}</td>${dash}</tr>`
}
function renderTrades(res) {
  $('trades').innerHTML = res.trades.length ? `<table><thead><tr><th>Entry</th><th>Last day held</th><th>Days</th><th>Return</th></tr></thead><tbody>${res.trades.map((t) => `<tr><td>${t.entry}</td><td>${t.open ? 'still open' : t.last}</td><td>${t.days}</td><td>${pct(t.ret)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">No trades with these settings.</p>'
}
function caption(m) { $('src').textContent = m ? `${SRC[m.eps_source] ?? m.eps_source}${m.first_pe ? ` · P/E ${m.first_pe} → ${m.last_pe}` : ''}` : '' }
function message(text) { $('banners').replaceChildren(...(text ? [Object.assign(document.createElement('p'), { className: 'msg', textContent: text })] : [])) }
const manifestMeta = () => manifest.tickers.find((t) => t.ticker === state.ticker)
function renderGrid(stock, bench) {
  const g = sensitivity(stock, bench, { ...state, from: state.from || undefined }, ENTRIES, EXITS)
  $('grid').innerHTML = `<table><thead><tr><th>enter \\ exit</th>${EXITS.map((x) => `<th>${x.toFixed(2)}×</th>`).join('')}</tr></thead><tbody>` +
    ENTRIES.map((e, i) => `<tr><th>${e.toFixed(2)}×</th>${EXITS.map((x, j) => { const c = g[i][j]; if (!c) return '<td>–</td>'; const cur = Math.abs(e - state.entry) < 1e-9 && Math.abs(x - state.exitMult) < 1e-9
      return `<td><button class="${cur ? 'cur' : ''}" data-en="${e}" data-ex="${x}" style="background:${heatColor(c.excessCagr)}" title="CAGR ${pct(c.cagr)} · Sharpe ${c.sharpe.toFixed(2)}">${c.excessCagr >= 0 ? '+' : ''}${(c.excessCagr * 100).toFixed(1)}%<small>${plural(c.trades, 'trade')}</small></button></td>` })}</tr>`).join('') + '</tbody></table>'
  const gi = ENTRIES.findIndex((e) => Math.abs(e - state.entry) < 1e-9), gj = EXITS.findIndex((x) => Math.abs(x - state.exitMult) < 1e-9)
  const pl = gi >= 0 && gj >= 0 && g[gi][gj] ? plateau(g, gi, gj) : null
  $('plateau').textContent = pl ? `${pl.ahead} of ${pl.n} neighbouring settings beat buy-and-hold.` : ''
  $('grid').querySelectorAll('button').forEach((b) => (b.onclick = () => { state.entry = Number(b.dataset.en); state.exitMult = Number(b.dataset.ex); sync(); schedule() }))
}

async function renderUniverse() {
  const list = manifest.tickers.filter((t) => t.first_pe).map((t) => t.ticker)
  const bench = await loadSeries(state.bench)
  const stocks = Object.fromEntries(await Promise.all(list.map(async (t) => [t, await loadSeries(t)])))
  const u = universe(stocks, bench, { ...state, from: state.from || undefined })
  if (!u.total) { $('uniout').innerHTML = '<p class="note">No stock has enough P/E history for these settings.</p>'; return }
  $('uniout').innerHTML = `<p class="note">${u.ahead} of ${u.total} stocks beat buy-and-hold with these settings. Median difference in CAGR: ${signed(u.median)}.</p><div class="scroll"><table><thead><tr><th>Stock</th><th>vs buy-and-hold</th><th>CAGR</th><th>Max drawdown</th><th>Trades</th></tr></thead><tbody>` +
    u.rows.map((r) => `<tr><td><button class="link" data-t="${esc(r.ticker)}">${esc(r.ticker)}</button></td><td style="background:${heatColor(r.excess)}">${signed(r.excess)}</td><td>${pct(r.cagr)}</td><td>${pct(r.maxDD)}</td><td>${r.trades}</td></tr>`).join('') + '</tbody></table></div>'
  $('uniout').querySelectorAll('button[data-t]').forEach((b) => (b.onclick = () => { state.ticker = b.dataset.t; sync(); schedule(); window.scrollTo({ top: 0 }) }))
}

// ---------- main ----------
async function update() {
  const mine = ++seq
  if (!state.ticker) { message('No stocks loaded yet. Add your own data in the sidebar.'); for (const id of ['stats', 'grid', 'trades']) $(id).replaceChildren(); caption(null); return }
  try {
    const [stock, bench] = await Promise.all([loadSeries(state.ticker), loadSeries(state.bench)])
    if (mine !== seq) return
    const res = run(stock, bench, { ...state, from: state.from || undefined })
    lastRes = res
    caption(manifestMeta()); message(res.error ? `${res.error} Try a shorter window.` : '')
    if (res.error) { for (const id of ['stats', 'grid', 'trades']) $(id).replaceChildren(); return }
    renderStats(res); renderTrades(res); drawCharts(res, stock, bench)
    clearTimeout(gridTimer); gridTimer = setTimeout(() => renderGrid(stock, bench), 120)
    if (uniOn) { clearTimeout(uniTimer); uniTimer = setTimeout(() => renderUniverse().catch((e) => message(e.message)), 350) }
  } catch (e) { message(e.message) }
}
async function main() {
  try { setTheme(localStorage.getItem('pe-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) } catch {}
  const q = new URLSearchParams(location.search)
  const dev = q.has('dev') ? await import('./dev-fixtures.js') : null
  const mode = dev ? q.get('data') ?? 'demo' : 'live'
  if (mode === 'worst') { manifest = dev.worst(cache, parseSeries); demo = true } else if (mode === 'empty') { manifest = { tickers: [] }; demo = true } else manifest = await loadManifest()
  if (!manifest) { demo = true; manifest = makeDemo() }
  dev?.mountToggle(mode)
  for (const [n, j] of Object.entries(saved())) { try { register(n, j) } catch {} }
  const c = ctx()
  for (const [id, list] of [['ticker', c.tickers], ['bench', c.benches]]) $(id).replaceChildren(...list.map((t) => Object.assign(document.createElement('option'), { value: t, textContent: t })))
  state = decodeState(location.hash, c)
  bind(); sync(); await update()
}
main()
