// Pure helpers for the page (no DOM): URL state, CSV export, heat-map colours.
import { STANDARD } from './engine.js'

export const LIMITS = { lookbackYears: [1, 10], entry: [0.8, 1.1], exitMult: [1.02, 1.5], costBps: [0, 50], delayDays: [0, 5] }
export const DEFAULT_STATE = {
  ticker: '', bench: 'SPY', from: '',
  lookbackYears: STANDARD.lookbackYears, entry: STANDARD.entry, exitMult: STANDARD.exitMult, costBps: STANDARD.costBps, delayDays: STANDARD.delayDays,
}
const KEYS = { ticker: 't', bench: 'b', from: 'f', lookbackYears: 'lb', entry: 'en', exitMult: 'ex', costBps: 'c', delayDays: 'd' }

export function encodeState(s) {
  const p = new URLSearchParams()
  for (const [k, h] of Object.entries(KEYS)) if (k === 'ticker' || (s[k] !== '' && s[k] !== DEFAULT_STATE[k])) p.set(h, String(s[k]))
  return p.toString()
}

/** Untrusted hash -> valid state: unknown tickers fall back, numbers are clamped, exit stays above entry. */
export function decodeState(hash, { tickers = [], benches = ['SPY', 'QQQ'] } = {}) {
  const p = new URLSearchParams(String(hash).replace(/^#/, ''))
  const s = { ...DEFAULT_STATE, ticker: tickers[0] ?? '', bench: benches[0] ?? 'SPY' }
  if (tickers.includes(p.get(KEYS.ticker))) s.ticker = p.get(KEYS.ticker)
  if (benches.includes(p.get(KEYS.bench))) s.bench = p.get(KEYS.bench)
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get(KEYS.from) ?? '')) s.from = p.get(KEYS.from)
  for (const k of Object.keys(LIMITS)) {
    const n = Number(p.get(KEYS[k]))
    if (p.has(KEYS[k]) && Number.isFinite(n)) s[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], n))
  }
  if (s.exitMult <= s.entry) s.exitMult = Math.min(LIMITS.exitMult[1], +(s.entry + 0.05).toFixed(2))
  return s
}

export function toCsv(trades, ticker) {
  const rows = trades.map((t) => [ticker, t.entry, t.open ? '' : t.last, t.open, t.days, t.ret.toFixed(6)].join(','))
  return ['ticker,entry,last_day_held,still_open,days,return', ...rows].join('\n') + '\n'
}

/** Excess CAGR vs buy-and-hold -> background colour; saturates at +/-5 points a year. */
export function heatColor(excess) {
  const a = Math.round(Math.min(1, Math.abs(excess) / 0.05) * 55)
  return `color-mix(in srgb, var(${excess >= 0 ? '--good' : '--bad'}) ${a}%, transparent)`
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** How many of a grid cell's neighbours (up to 8) beat buy-and-hold: a broad plateau is a better sign than one lucky cell. */
export function plateau(grid, i, j) {
  let n = 0
  let ahead = 0
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    if (!di && !dj) continue
    const c = grid[i + di]?.[j + dj]
    if (c) { n++; if (c.excessCagr > 0) ahead++ }
  }
  return { n, ahead }
}
