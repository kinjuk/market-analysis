# P/E mean reversion: rules

- **Enter** when the P/E crosses below its 5-year average. A cross, not just "is below".
- **Exit** when the P/E reaches 1.2 times that average.
- Fully invested or fully in cash. Cash earns nothing.

## Standard test
| | |
|---|---|
| Average window | 5 years |
| Entry / exit | cross below 1.0x / 1.2x |
| Costs | 5 bps per side |
| Fills | the signal is known after the close and filled one close later |
| Compared with | the same stock held, and SPY or QQQ |

Run it from `pe-reversion.ipynb`, `python report.py --ticker AAPL --benchmark SPY`, or the page in `app/`.

## Data
Backtests use trailing P/E from SEC filings (as they were known on each date, split-adjusted) or your own `date,pe` CSV. The live signal uses forward P/E, logged daily by `log_pe.py`.

## Where it is weak
- It enters on any cross, even a 0.02% one, so a noisy P/E can trigger entries that aren't cheap. `--entry 0.95` asks for a real dip.
- A decade gives each stock only a handful of trades. Under five is an anecdote. The page's all-stocks table and sensitivity grid are better evidence than any one chart.
- The settings are tuned on the same window they're tested on. The first-half and second-half Sharpe numbers and the neighbour count in the grid are sanity checks, not proof.
- Cyclicals invert the signal, and zero or negative earnings force cash.
- The stock list was picked today, so it favours survivors.
- A trailing-P/E backtest says little about the forward-P/E signal.
