// Pure functions (no DOM, no network). Mirrors strategy.py + report.py so Python and the browser agree.
export const STANDARD = { lookbackYears: 5, entry: 1.0, exitMult: 1.2, costBps: 5, delayDays: 1, minCoverage: 0.9 }
const DAY = 86400000

/** JSON from build_data.py -> typed arrays. `pe` null/missing becomes NaN. */
export function parseSeries(json) {
  const dates = json.dates
  return {
    dates,
    days: Float64Array.from(dates, (d) => Date.parse(`${d}T00:00:00Z`) / DAY),
    adj: Float64Array.from(json.adj_close),
    pe: Float64Array.from(json.pe ?? dates.map(() => null), (v) => (v === null ? NaN : v)),
  }
}

/** Rolling mean of P/E over a calendar window (t - W, t], needing minCoverage of ~252 obs/yr (pandas semantics). */
export function rollingAvg(days, pe, lookbackYears, minCoverage = STANDARD.minCoverage) {
  const W = Math.floor(lookbackYears * 365.25)
  const minObs = Math.floor(lookbackYears * 252 * minCoverage)
  const n = days.length
  const avg = new Float64Array(n).fill(NaN)
  let lo = 0
  for (let i = 0; i < n; i++) {
    while (days[lo] <= days[i] - W) lo++
    let s = 0
    let c = 0
    for (let j = lo; j <= i; j++) if (!Number.isNaN(pe[j])) { s += pe[j]; c++ }
    if (c >= minObs && c > 0) avg[i] = s / c
  }
  return avg
}

/** state[i] = 1 means long after day i's close. Entry needs an actual cross below `entry` x average. */
export function stateMachine(pe, avg, entry, exitMult) {
  const state = new Uint8Array(pe.length)
  let cur = 0
  let prev = NaN
  for (let i = 0; i < pe.length; i++) {
    const r = pe[i] / avg[i]
    if (Number.isNaN(r)) cur = 0
    else if (cur === 0 && !Number.isNaN(prev) && prev >= entry && r < entry) cur = 1
    else if (cur === 1 && r >= exitMult) cur = 0
    state[i] = cur
    prev = r
  }
  return state
}

/** Signal is known after the close, so it is filled `delayDays` closes later (no look-ahead). */
export function backtest(state, adj, delayDays, costBps) {
  const n = state.length
  const lag = 1 + delayDays
  const pos = new Float64Array(n)
  const hold = new Float64Array(n)
  const strat = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    pos[i] = i - lag >= 0 ? state[i - lag] : 0
    hold[i] = i === 0 ? 0 : adj[i] / adj[i - 1] - 1
  }
  for (let i = 0; i < n; i++) {
    const turnover = i === 0 ? 0 : Math.abs(pos[i] - pos[i - 1])
    strat[i] = pos[i] * hold[i] - (turnover * costBps) / 1e4
  }
  return { pos, hold, strat }
}

export function stats(r) {
  const n = r.length
  let mean = 0
  for (const x of r) mean += x
  mean /= n
  let ss = 0
  for (const x of r) ss += (x - mean) ** 2
  const sd = Math.sqrt(ss / (n - 1))
  let cum = 1
  let peak = -Infinity
  let maxDD = 0
  for (const x of r) {
    cum *= 1 + x
    peak = Math.max(peak, cum)
    maxDD = Math.min(maxDD, cum / peak - 1)
  }
  return { cagr: cum ** (252 / n) - 1, vol: sd * Math.sqrt(252), sharpe: sd > 0 ? (mean / sd) * Math.sqrt(252) : 0, maxDD }
}

export function tradeList(pos, hold, dates) {
  const out = []
  const n = pos.length
  for (let i = 0; i < n; ) {
    if (pos[i] !== 1) { i++; continue }
    let j = i
    let g = 1
    while (j < n && pos[j] === 1) { g *= 1 + hold[j]; j++ }
    out.push({ entry: dates[i], last: dates[j - 1], open: j === n, days: j - i, ret: g - 1 })
    i = j
  }
  return out
}

/** Benchmark prices on the stock's dates: exact-date match, then forward-fill inside the window (as report.py does). */
function benchReturns(dates, bench, from) {
  const byDate = new Map(bench.dates.map((d, i) => [d, bench.adj[i]]))
  const px = []
  let last = NaN
  for (let i = from; i < dates.length; i++) {
    const v = byDate.get(dates[i])
    if (v !== undefined) last = v
    px.push(last)
  }
  return Float64Array.from(px, (p, k) => (k === 0 || Number.isNaN(p) || Number.isNaN(px[k - 1]) ? 0 : p / px[k - 1] - 1))
}

/** One standard test. `params.avg` lets callers reuse a precomputed rolling average (e.g. for sensitivity grids). */
export function run(stock, bench, params = {}) {
  const { avg: given, ...rest } = params
  const P = { ...STANDARD, ...rest }
  const avg = given ?? rollingAvg(stock.days, stock.pe, P.lookbackYears, P.minCoverage)
  const start = stock.pe.findIndex((v, i) => !Number.isNaN(v / avg[i]))
  if (start < 0) return { error: 'Not enough P/E history for this lookback.', P }
  const state = stateMachine(stock.pe, avg, P.entry, P.exitMult)
  const bt = backtest(state, stock.adj, P.delayDays, P.costBps)
  const dates = stock.dates.slice(start)
  const pos = bt.pos.slice(start)
  const hold = bt.hold.slice(start)
  const strat = bt.strat.slice(start)
  const benchR = benchReturns(stock.dates, bench, start)
  return {
    P, start, dates, pe: stock.pe.slice(start), avg: avg.slice(start), pos, strat, hold, bench: benchR,
    stats: { strategy: stats(strat), hold: stats(hold), bench: stats(benchR) },
    timeInMarket: pos.reduce((a, b) => a + b, 0) / pos.length,
    trades: tradeList(pos, hold, dates),
  }
}

/** Entry x exit grid: does the idea survive nearby settings, or is one cell a lucky pick? */
export function sensitivity(stock, bench, params, entries, exits) {
  const P = { ...STANDARD, ...params }
  const avg = rollingAvg(stock.days, stock.pe, P.lookbackYears, P.minCoverage)
  return entries.map((entry) =>
    exits.map((exitMult) => {
      if (exitMult <= entry) return null
      const r = run(stock, bench, { ...P, entry, exitMult, avg })
      if (r.error) return null
      return { cagr: r.stats.strategy.cagr, sharpe: r.stats.strategy.sharpe, excessCagr: r.stats.strategy.cagr - r.stats.hold.cagr, trades: r.trades.length }
    }),
  )
}
