# P/E mean reversion
Long when P/E **crosses below** its N-year average; exit when it reaches **1.2×** that average; cash in between.

## Web page (GitHub Pages)
`app/index.html`: pick a stock, SPY or QQQ as benchmark, and tweak the average window, entry, exit, costs, delay and start date. Shows P/E vs its average, growth of 1, drawdown, an entry × exit sensitivity grid, the trade list (CSV export), and a shareable link that stores your settings. It runs entirely in the browser on `app/engine.js`, which is tested against the Python engine (`app/test/`). Data comes from `app/data/*.json` (built weekly by the "Build site data" workflow from `universe.txt`); without data it shows clearly labelled demo data.

## Two modes, two different series
| | Series | Source | History |
|---|---|---|---|
| **Backtest** | trailing P/E | `trailing_pe.py` (SEC EDGAR EPS, point-in-time, split-adjusted) or your own `date,pe` CSV | available now |
| **Live signal** | forward P/E | `log_pe.py` (daily GitHub Action → `data/forward_pe.csv`) | accrues from day one; 5y average needs ~4.5y |

A backtest on trailing P/E does **not** validate the forward-P/E signal; it tests the idea on a related series. Say so wherever you show results.

## Visualize a test
`pe-reversion.ipynb` (or `python report.py --ticker AAPL --benchmark SPY`) plots P/E vs its average, growth of 1 against buy-and-hold and SPY/QQQ, drawdowns and a stats table, using the standard parameters in `strategy.md`.
Install: `pip install -r requirements-dev.txt jupyter`.

## Use
    pip install -r requirements-dev.txt && pytest -q
    # backtest (single stock)
    SEC_USER_AGENT="Your Name you@email.com" python trailing_pe.py --ticker AAPL --years 12
    python strategy.py --source trailing --ticker AAPL
    # index/ETF (no EPS on EDGAR): supply a monthly/daily date,pe CSV, e.g. S&P 500 P/E copied from multpl.com
    python strategy.py --source csv --pe-csv spy_pe.csv --ticker SPY
    # live
    python log_pe.py
    python strategy.py --source forward --ticker MSFT

## Caveats
- EPS ≤ 0 gives no P/E and forces the signal flat. Cyclicals invert the signal (low P/E at peak earnings).
- Q4 EPS is derived (annual minus three quarters); share-count changes make it approximate.
- Fixed ticker choice today = survivorship bias. Dividends are included in strategy returns (adjusted prices), not in P/E.
- Yahoo's forward EPS follows a fiscal-year horizon, so the live series can jump. EPS and price are logged to rebuild a constant horizon later.
- ETFs often have no forward P/E on Yahoo. GitHub disables scheduled runs after 60 days without repo activity: check the Actions tab.
- Few trades means anecdote: under 5 trades the CLI warns you.
