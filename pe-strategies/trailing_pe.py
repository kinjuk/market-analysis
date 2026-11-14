"""Point-in-time trailing P/E history for backtests, from free SEC EDGAR data.

EPS facts carry the date they were FILED, so each day's TTM EPS only uses filings that existed that day
(no look-ahead). Restated values are ignored (first-filed wins). EPS is converted to today's split-adjusted
units so it matches Yahoo's split-adjusted prices.
Usage:  SEC_USER_AGENT="Your Name you@email.com" python trailing_pe.py --ticker AAPL --years 12
"""
import argparse
import os
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent


def quarters(entries):
    """SEC EPS facts -> quarterly EPS (end, val, filed). Q4 = annual minus the three quarters of that fiscal year."""
    df = pd.DataFrame(entries)[["start", "end", "val", "filed"]]
    for c in ("start", "end", "filed"):
        df[c] = pd.to_datetime(df[c])
    df["days"] = (df.end - df.start).dt.days
    df = df.sort_values("filed").drop_duplicates(["start", "end"], keep="first")
    qs = df[df.days.between(80, 100)]
    rows = [qs[["end", "val", "filed"]]]
    for _, a in df[df.days.between(350, 380)].iterrows():
        inside = qs[(qs.start >= a.start) & (qs.end <= a.end)]
        if len(inside) == 3:
            rows.append(pd.DataFrame([{"end": a.end, "val": a.val - inside.val.sum(), "filed": a.filed}]))
    return pd.concat(rows).drop_duplicates("end").sort_values("end").reset_index(drop=True)


def ttm_series(q, dates, splits=None):
    """TTM EPS per date from the latest 4 consecutive quarters filed on or before that date."""
    q = q.copy()
    if splits is not None and len(splits):
        q["val"] = [r.val / splits[splits.index > r.filed].prod() for r in q.itertuples()]
    out = pd.Series(np.nan, index=dates)
    for d in dates:
        k = q[q.filed <= d].tail(4)
        if len(k) == 4 and (k.end.iloc[-1] - k.end.iloc[0]).days < 300:
            out[d] = k.val.sum()
    return out


def build(ticker, years=12):
    import requests
    import yfinance as yf
    ua = os.environ.get("SEC_USER_AGENT")
    if not ua:
        raise SystemExit('Set SEC_USER_AGENT="Your Name you@email.com" (the SEC blocks anonymous requests).')
    get = lambda u: requests.get(u, headers={"User-Agent": ua}, timeout=30).json()
    cik = next((v["cik_str"] for v in get("https://www.sec.gov/files/company_tickers.json").values()
                if v["ticker"] == ticker.upper()), None)
    if cik is None:
        raise SystemExit(f"{ticker}: not found in SEC ticker list (ETFs and indices have no EPS).")
    us = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{int(cik):010d}.json")["facts"]["us-gaap"]
    tag = next(t for t in ("EarningsPerShareDiluted", "EarningsPerShareBasic") if t in us)
    q = quarters(us[tag]["units"]["USD/shares"])
    t = yf.Ticker(ticker)
    px = t.history(period=f"{years}y", auto_adjust=False)["Close"]  # split-adjusted, not dividend-adjusted
    px.index = px.index.tz_localize(None)
    sp = t.splits
    sp.index = sp.index.tz_localize(None)
    eps = ttm_series(q, px.index, sp)
    out = pd.DataFrame({"price": px, "ttm_eps": eps})
    out["pe"] = np.where(out.ttm_eps > 0, out.price / out.ttm_eps, np.nan)  # negative earnings -> no P/E
    return out.rename_axis("date")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--ticker", required=True)
    a.add_argument("--years", type=int, default=12)
    q = a.parse_args()
    df = build(q.ticker, q.years)
    p = HERE / "data" / f"trailing_{q.ticker.upper()}.csv"
    p.parent.mkdir(exist_ok=True)
    df.to_csv(p)
    print(f"Saved {p} · {df.pe.notna().sum()} days with a P/E · first {df.pe.first_valid_index()}")
