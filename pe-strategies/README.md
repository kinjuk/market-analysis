# P/E mean reversion

One idea, tested a few ways: buy a stock when its P/E drops below its own 5-year average, sell when the P/E climbs to 1.2 times that average, and sit in cash in between. Every number in that sentence can be changed.

**Try it:** `app/index.html` (GitHub Pages Preview: https://kinjuk.github.io/market-analysis/pe-strategies/app/#t=QCOM&b=QQQ&f=2015-05-23&lb=2.5&ex=1.5&c=1) runs the test in the browser. Pick a stock, move the sliders, and compare the result with buy-and-hold and with SPY or QQQ. You can also upload your own CSVs.

## What's here
- `app/`: the web page. `engine.js` does the maths and is checked against the Python version on every push.
- `strategy.py`, `report.py`, `pe-reversion.ipynb`: the same test in Python.
- `trailing_pe.py` and `build_data.py`: build the P/E history (from SEC filings, or Yahoo when no SEC contact is set) and the JSON files the page reads. A weekly Action refreshes them.
- `log_pe.py`: saves each stock's forward P/E every weekday. A 5-year average needs about four and a half years of those, so it isn't usable yet.

## Two P/E series, on purpose
Backtests run on trailing P/E because it has history. The forward P/E being logged is what a live signal would use, and it's too short to test. A good result on one tells you little about the other.

## Run it
    pip install -r requirements-dev.txt && pytest -q
    node --test app/test/parity.test.mjs app/test/ui-state.test.mjs app/test/upload.test.mjs   # after: python app/test/make_fixtures.py

    SEC_USER_AGENT="Your Name you@email.com" python trailing_pe.py --ticker AAPL --years 12
    python strategy.py --source trailing --ticker AAPL
    python report.py --ticker AAPL --benchmark SPY
    python strategy.py --source csv --pe-csv spy_pe.csv --ticker SPY    # ETFs have no EPS, so bring your own P/E series
    python log_pe.py                                                    # the daily forward P/E logger

`pip install jupyter` if you want the notebook.

## What can mislead you
- Zero or negative earnings give no P/E, and the strategy goes to cash. Cyclicals flip the signal, since their P/E is lowest when earnings peak.
- Q4 earnings are worked out as the year minus three quarters, so share-count changes make them a little off.
- The stock list was picked today, which favours companies that survived.
- Yahoo's forward EPS follows the fiscal year, so the live series can jump when the year rolls over.
- Yahoo often has no forward P/E for ETFs.
- GitHub stops scheduled workflows after 60 days without repo activity. Check the Actions tab now and then.
- Few trades means an anecdote. The Python report warns under 5; the page shows the count and has an all-stocks table.
