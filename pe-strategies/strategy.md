# P/E mean reversion

## Rules
- **Entry:** P/E crosses below its 5-year average (an actual cross, not just "is below").
- **Exit:** P/E reaches 1.2x its 5-year average.
- Long-only, 100% invested or 100% cash. Cash earns 0%. Repeat.

## Standard test
| Parameter | Value |
|---|---|
| Average window | 5 years |
| Entry / exit | cross below 1.0x / 1.2x |
| Costs | 5 bps per side |
| Execution | signal known after the close, filled one close later |
| Benchmarks | same-stock buy-and-hold, and SPY or QQQ |

Run: `pe-reversion.ipynb`, or `python report.py --ticker AAPL --benchmark SPY` (saves `results/AAPL_vs_SPY.png`).

## Data
- **Backtest:** trailing P/E from SEC EDGAR EPS, point-in-time and split-adjusted (`trailing_pe.py`), or your own `date,pe` CSV (for SPY/QQQ, which have no EPS).
- **Live:** forward P/E logged daily (`log_pe.py`); a 5-year average needs about 4.5 years of history.

## Known weaknesses
- A hair-thin cross below the average triggers entry, so noisy P/E series can whipsaw. `--entry 0.95` demands a real dip.
- Few trades per decade: under 5 is an anecdote.
- Cyclicals invert the signal (low P/E at peak earnings); EPS ≤ 0 forces cash.
- Single tickers chosen today have survivorship bias.
- A trailing-P/E backtest does not validate the forward-P/E signal.
