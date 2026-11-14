"""Builds the JSON files the browser page loads (app/data/*.json). Needs network: run locally or via the Action.

    python build_data.py                         # whole universe.txt
    python build_data.py --tickers AAPL MSFT --years 15
EPS source: SEC EDGAR (GAAP, point-in-time, split-adjusted) when SEC_USER_AGENT is set; otherwise Yahoo's reported-EPS
history (analyst-basis EPS, assumed split-adjusted by Yahoo). SPY gets a labelled S&P 500 proxy P/E from Shiller's data.
"""
import argparse
import json
import os
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

import trailing_pe as T

HERE = Path(__file__).parent
OUT = HERE / "app" / "data"
SHILLER_URL = "https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv"
BENCHMARKS = ["QQQ"]  # price only: benchmark, no P/E


def read_universe(path=HERE / "universe.txt"):
    return [l.strip().upper() for l in Path(path).read_text().splitlines() if l.strip() and not l.startswith("#")]


def pe_from_ttm(price, ttm):
    return (price / ttm).where(ttm > 0)  # negative or zero earnings -> no P/E


def history(ticker, years):
    import yfinance as yf
    h = yf.Ticker(ticker).history(period=f"{years}y", auto_adjust=False)
    h.index = pd.to_datetime(h.index).tz_localize(None).normalize()
    return h[["Close", "Adj Close"]]


def yahoo_quarters(ticker):
    import yfinance as yf
    d = yf.Ticker(ticker).get_earnings_dates(limit=80)
    if d is None or "Reported EPS" not in d:
        raise ValueError("no earnings history on Yahoo")
    d = d["Reported EPS"].dropna()
    idx = pd.to_datetime(d.index).tz_localize(None).normalize()
    q = pd.DataFrame({"end": idx, "val": d.values, "filed": idx}).sort_values("end").drop_duplicates("end")
    return q.reset_index(drop=True)


def shiller_pe(close, source=SHILLER_URL, lag_months=3, max_gap_rows=45):
    """S&P 500 trailing P/E proxy: index close / Shiller 12m earnings, lagged so interpolation can't leak the future."""
    e = pd.read_csv(source, parse_dates=["Date"]).set_index("Date")["Earnings"].astype(float)
    e = e.where(e > 0).shift(lag_months)  # zeros mean "not published yet"
    e = e.reindex(close.index.union(e.index)).ffill(limit=max_gap_rows).reindex(close.index)
    return (close / e).where(e > 0)


def payload(ticker, h, pe, source):
    pe = pe.reindex(h.index) if pe is not None else None
    return {"ticker": ticker, "pe_kind": "trailing", "eps_source": source, "built": str(date.today()),
            "dates": [d.strftime("%Y-%m-%d") for d in h.index],
            "adj_close": [round(float(x), 4) for x in h["Adj Close"]],
            "pe": None if pe is None or pe.isna().all() else [None if np.isnan(x) else round(float(x), 3) for x in pe]}


def build_stock(t, years, ua):
    import yfinance as yf
    h = history(t, years)
    source, q, splits = "yahoo", None, None
    if ua:
        try:
            q = T.sec_quarters(t, ua)
            sp = yf.Ticker(t).splits
            sp.index = sp.index.tz_localize(None)
            source, splits = "sec", sp
        except (SystemExit, Exception) as e:
            print(f"  {t}: SEC failed ({e}); falling back to Yahoo")
    if q is None:
        q = yahoo_quarters(t)
    ttm = T.ttm_series(q, h.index, splits, span_days=300 if source == "sec" else 330)
    return payload(t, h, pe_from_ttm(h["Close"], ttm), source)


def build_spy(years):
    h = history("SPY", years)
    gspc = history("^GSPC", years + 6)["Close"]
    return payload("SPY", h, shiller_pe(gspc).reindex(h.index), "shiller-proxy")


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--tickers", nargs="*")
    a.add_argument("--years", type=int, default=16)
    q = a.parse_args()
    ua = os.environ.get("SEC_USER_AGENT") or None
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [(t, lambda t=t: build_stock(t, q.years, ua)) for t in (q.tickers or read_universe())]
    if not q.tickers:
        jobs += [("SPY", lambda: build_spy(q.years))] + [(b, lambda b=b: payload(b, history(b, q.years), None, "none")) for b in BENCHMARKS]
    manifest, failed = [], []
    for t, fn in jobs:
        try:
            p = fn()
            (OUT / f"{t}.json").write_text(json.dumps(p, separators=(",", ":")))
            ok = [d for d, v in zip(p["dates"], p["pe"] or []) if v is not None]
            manifest.append({"ticker": t, "eps_source": p["eps_source"], "first_pe": ok[0] if ok else None,
                             "last_pe": ok[-1] if ok else None, "last_date": p["dates"][-1], "days": len(p["dates"])})
            print(f"{t}: {p['eps_source']}, P/E {ok[0] if ok else '-'} → {ok[-1] if ok else '-'}")
        except Exception as e:
            failed.append(t)
            print(f"{t}: FAILED ({e})")
    if manifest:
        (OUT / "index.json").write_text(json.dumps({"built": str(date.today()), "tickers": manifest}, indent=1))
    if failed:
        print("Failed:", ", ".join(failed))
    raise SystemExit(0 if manifest else 1)


if __name__ == "__main__":
    main()
