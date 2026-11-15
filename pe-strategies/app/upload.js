// Pure CSV helpers for "add your own data": no DOM, no network.
export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) throw new Error('Empty file.')
  const delim = [',', ';', '\t'].reduce((best, d) => (lines[0].split(d).length > lines[0].split(best).length ? d : best), ',')
  const re = new RegExp(`${delim === '\t' ? '\\t' : delim}(?=(?:[^"]*"[^"]*")*[^"]*$)`)
  const split = (l) => l.split(re).map((c) => c.trim().replace(/^"|"$/g, ''))
  return { header: split(lines[0]).map((h) => h.toLowerCase()), rows: lines.slice(1).map(split) }
}

export function normDate(s) {
  const t = String(s ?? '').trim()
  const ok = (y, m, d) => (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null)
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t)
  if (m) return ok(m[1], m[2], m[3])
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t) // US month/day/year
  return m ? ok(m[3], m[1], m[2]) : null
}

const num = (s) => { const v = parseFloat(String(s).replace(/[,%$\s]/g, '')); return Number.isFinite(v) ? v : null }
const find = (header, tests) => { for (const t of tests) { const i = header.findIndex((h) => t.test(h)); if (i >= 0) return i } return -1 }

export function columns(header) {
  return {
    date: Math.max(0, find(header, [/^date/, /^time/])),
    price: find(header, [/^adj[ _]?close$/, /^close$/, /^price$/, /^last$/]),
    pe: find(header, [/^p\/?e([ _]ratio)?$/, /^pe[ _]ratio$/, /^trailing[ _]?pe$/]),
  }
}

export const cleanName = (s) => String(s).toUpperCase().replace(/[^A-Z0-9.^=-]/g, '').slice(0, 12) || 'CUSTOM'

/** One or more parsed CSVs (prices and/or P/E) -> the JSON shape build_data.py writes. P/E is carried forward, but not past `maxStaleDays`. */
export function mergeUpload(files, { maxStaleDays = 100 } = {}) {
  const series = (kind) => {
    const m = new Map()
    for (const f of files) {
      const c = columns(f.header)
      if (c[kind] < 0) continue
      for (const r of f.rows) { const d = normDate(r[c.date]); const v = num(r[c[kind]] ?? ''); if (d && v !== null && v > 0) m.set(d, v) }
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }
  const price = series('price')
  const pe = series('pe')
  if (!price.length) throw new Error('No price column found (need Adj Close, Close or Price).')
  if (!pe.length) throw new Error('No P/E column found (need a column named PE or P/E).')
  if (price.length < 250) throw new Error(`Only ${price.length} price rows; need at least 250.`)
  const day = (d) => Date.parse(`${d}T00:00:00Z`) / 86400000
  const out = { dates: [], adj_close: [], pe: [] }
  let j = -1
  for (const [d, p] of price) {
    while (j + 1 < pe.length && pe[j + 1][0] <= d) j++
    out.dates.push(d)
    out.adj_close.push(p)
    out.pe.push(j >= 0 && day(d) - day(pe[j][0]) <= maxStaleDays ? pe[j][1] : null)
  }
  if (out.pe.every((v) => v === null)) throw new Error('The P/E dates do not overlap the price dates.')
  return out
}
