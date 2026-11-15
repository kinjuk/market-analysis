import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_STATE, decodeState, encodeState, heatColor, toCsv } from '../ui-state.js'

const ctx = { tickers: ['AAPL', 'MSFT'], benches: ['SPY', 'QQQ'] }

test('state survives an encode/decode round trip', () => {
  const s = { ...DEFAULT_STATE, ticker: 'MSFT', bench: 'QQQ', from: '2015-01-01', lookbackYears: 3.5, entry: 0.95, exitMult: 1.3, costBps: 10, delayDays: 2 }
  assert.deepEqual(decodeState(encodeState(s), ctx), s)
})

test('default settings produce a short link containing only the ticker', () => {
  assert.equal(encodeState({ ...DEFAULT_STATE, ticker: 'AAPL' }), 't=AAPL')
})

test('hostile or broken hashes fall back to safe values', () => {
  const s = decodeState('#t=<script>&b=EVIL&lb=9999&en=abc&ex=-4&c=-1&d=99&f=notadate', ctx)
  assert.deepEqual([s.ticker, s.bench, s.from], ['AAPL', 'SPY', ''])
  assert.equal(s.lookbackYears, 10)
  assert.equal(s.entry, DEFAULT_STATE.entry)
  assert.ok(s.exitMult > s.entry)
  assert.deepEqual([s.costBps, s.delayDays], [0, 5])
})

test('exit is forced above entry', () => {
  const s = decodeState('#t=AAPL&en=1.1&ex=1.05', ctx)
  assert.ok(s.exitMult > s.entry)
})

test('csv has a header, blank last day for open trades, and a trailing newline', () => {
  const csv = toCsv([{ entry: '2020-03-20', last: '2020-09-01', open: false, days: 120, ret: 0.1234567 }, { entry: '2024-01-02', last: '2024-06-01', open: true, days: 100, ret: -0.05 }], 'AAPL')
  assert.equal(csv, 'ticker,entry,last_day_held,still_open,days,return\nAAPL,2020-03-20,2020-09-01,false,120,0.123457\nAAPL,2024-01-02,,true,100,-0.050000\n')
})

test('heat colour is green when positive, red when negative, and saturates', () => {
  assert.match(heatColor(0.02), /--good/)
  assert.match(heatColor(-0.02), /--bad/)
  assert.equal(heatColor(0.5), heatColor(0.05))
})
