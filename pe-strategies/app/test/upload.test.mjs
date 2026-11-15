import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanName, mergeUpload, normDate, parseCsv } from '../upload.js'

const yahoo = (n) => 'Date,Open,High,Low,Close,Adj Close,Volume\n' + Array.from({ length: n }, (_, i) => `${new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)},1,1,1,${10 + i},${9 + i},100`).join('\n')

test('parses quoted commas, semicolons and a BOM', () => {
  assert.deepEqual(parseCsv('\uFEFFDate,Note\n2020-01-01,"a, b"').rows, [['2020-01-01', 'a, b']])
  assert.deepEqual(parseCsv('Date;PE\n2020-01-01;21,5'.replace('21,5', '21.5')).header, ['date', 'pe'])
})

test('dates: ISO, slashes, US month/day/year; junk is rejected', () => {
  assert.equal(normDate('2024-1-5'), '2024-01-05')
  assert.equal(normDate('2024-03-04 00:00:00-05:00'), '2024-03-04')
  assert.equal(normDate('12/31/2023'), '2023-12-31')
  assert.equal(normDate('31/12/2023'), null)
  assert.equal(normDate('hello'), null)
})

test('prefers Adj Close over Close and merges a monthly P/E as-of, without carrying it too far', () => {
  const prices = parseCsv(yahoo(400))
  const pe = parseCsv('date,pe\n2020-01-01,20\n2020-02-01,22\n')           // nothing after February
  const m = mergeUpload([prices, pe])
  assert.equal(m.adj_close[0], 9)                                            // Adj Close, not Close
  assert.equal(m.pe[0], 20)
  assert.equal(m.pe[m.dates.indexOf('2020-02-15')], 22)
  assert.equal(m.pe[m.dates.indexOf('2020-03-10')], 22)                       // still within 100 days
  assert.equal(m.pe[m.dates.indexOf('2020-07-01')], null)                    // stale: dropped
})

test('one file with both price and P/E columns works', () => {
  const rows = Array.from({ length: 300 }, (_, i) => `${new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)},${50 + i},${15 + (i % 5)}`)
  const m = mergeUpload([parseCsv(`Date,Close,P/E\n${rows.join('\n')}`)])
  assert.equal(m.dates.length, 300)
  assert.equal(m.pe[3], 18)
})

test('clear error messages', () => {
  assert.throws(() => mergeUpload([parseCsv('date,pe\n2020-01-01,20')]), /No price column/)
  assert.throws(() => mergeUpload([parseCsv(yahoo(300))]), /No P\/E column/)
  assert.throws(() => mergeUpload([parseCsv(yahoo(10)), parseCsv('date,pe\n2020-01-01,20')]), /need at least 250/)
  assert.throws(() => mergeUpload([parseCsv(yahoo(300)), parseCsv('date,pe\n1999-01-01,20')]), /do not overlap/)
})

test('names are made safe for URLs and labels', () => {
  assert.equal(cleanName('aapl <b>'), 'AAPLB')
  assert.equal(cleanName('###'), 'CUSTOM')
})
