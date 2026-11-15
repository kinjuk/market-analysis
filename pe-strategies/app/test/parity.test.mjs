// Run `python app/test/make_fixtures.py` first. Checks engine.js against the Python engine's answers.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { parseSeries, rollingAvg, run, sensitivity, stateMachine, stats } from '../engine.js'

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'))
const stock = parseSeries(fx.stock)
const bench = parseSeries(fx.bench)
const close = (a, b, msg = '') => assert.ok(Math.abs(a - b) <= 1e-9 * (1 + Math.abs(b)), `${msg} ${a} vs ${b}`)

fx.cases.forEach((c, i) => {
  test(`parity #${i} ${JSON.stringify(c.params)}`, () => {
    const P = c.params
    const avg = rollingAvg(stock.days, stock.pe, P.lookbackYears)
    avg.forEach((v, k) => (c.avg[k] === null ? assert.ok(Number.isNaN(v), `avg NaN at ${k}`) : close(v, c.avg[k], `avg[${k}]`)))
    assert.deepEqual(Array.from(stateMachine(stock.pe, avg, P.entry, P.exitMult)), c.state)

    const r = run(stock, bench, P)
    assert.equal(r.dates[0], c.start)
    for (const k of ['strategy', 'hold', 'bench']) for (const m of ['cagr', 'vol', 'sharpe', 'maxDD']) close(r.stats[k][m], c.stats[k][m], `${k}.${m}`)
    close(r.timeInMarket, c.timeInMarket, 'timeInMarket')
    assert.equal(r.trades.length, c.trades.length)
    r.trades.forEach((t, k) => {
      const e = c.trades[k]
      assert.deepEqual([t.entry, t.open, t.days], [e.entry, e.open, e.days])
      if (!e.open) assert.equal(t.last, e.last)
      close(t.ret, e.ret, `trade ${k}`)
    })
  })
})

test('sensitivity cell equals a direct run with the same parameters', () => {
  const grid = sensitivity(stock, bench, { lookbackYears: 2 }, [0.95, 1.0], [1.1, 1.2])
  const direct = run(stock, bench, { lookbackYears: 2, entry: 0.95, exitMult: 1.2 })
  close(grid[0][1].cagr, direct.stats.strategy.cagr)
  assert.equal(grid[0][1].trades, direct.trades.length)
})

test('exit multiple at or below entry is not a valid cell', () => {
  assert.equal(sensitivity(stock, bench, {}, [1.0], [1.0])[0][0], null)
})

test('too little P/E history returns an error instead of crashing', () => {
  const short = { ...stock, pe: stock.pe.map(() => NaN) }
  assert.match(run(short, bench).error, /Not enough/)
})

test('entry fires when the ratio is exactly at the entry level and then dips below', () => {
  const pe = Float64Array.from([1, 1, 0.9])
  const avg = Float64Array.from([1, 1, 1])
  assert.deepEqual(Array.from(stateMachine(pe, avg, 1.0, 1.2)), [0, 0, 1])
})

test('drawdown is measured from the first observation, not from an implicit starting value of 1', () => {
  // Python: cum = [0.90, 0.945], running max = [0.90, 0.945] -> max drawdown is 0
  assert.equal(stats(Float64Array.from([-0.1, 0.05])).maxDD, 0)
})

test('a later start date trims the window without changing the rules', () => {
  const full = run(stock, bench, {})
  const from = full.dates[400]
  const later = run(stock, bench, { from })
  assert.equal(later.dates[0], from)
  assert.equal(later.dates.length, full.dates.length - 400)
  assert.match(run(stock, bench, { from: '2099-01-01' }).error, /after the last/)
})
