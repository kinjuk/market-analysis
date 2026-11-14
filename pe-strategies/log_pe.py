"""Append today's valuation snapshot per ticker to data/forward_pe.csv (idempotent per day + ticker)."""
import csv
from datetime import date
from pathlib import Path

import yfinance as yf

HERE = Path(__file__).parent
OUT = HERE / "data" / "forward_pe.csv"
FIELDS = ["date", "ticker", "price", "forward_pe", "forward_eps", "trailing_pe", "trailing_eps"]


def snapshot(t):
    i = yf.Ticker(t).info or {}
    return {"price": i.get("currentPrice") or i.get("regularMarketPrice") or i.get("navPrice"),
            "forward_pe": i.get("forwardPE"), "forward_eps": i.get("forwardEps"),
            "trailing_pe": i.get("trailingPE"), "trailing_eps": i.get("trailingEps")}


def valid(x):
    return isinstance(x, (int, float)) and x == x and x > 0


def main(tickers=None, today=None):
    tickers = tickers or [l.strip().upper() for l in (HERE / "tickers.txt").read_text().splitlines()
                          if l.strip() and not l.startswith("#")]
    today = str(today or date.today())
    OUT.parent.mkdir(exist_ok=True)
    seen, new = set(), not OUT.exists()
    if not new:
        with OUT.open() as f:
            seen = {(r["date"], r["ticker"]) for r in csv.DictReader(f)}
    missing = []
    with OUT.open("a", newline="") as f:
        w = csv.DictWriter(f, FIELDS)
        if new:
            w.writeheader()
        for t in tickers:
            if (today, t) in seen:
                continue
            try:
                s = snapshot(t)
            except Exception:
                missing.append(f"{t} (error)")
                continue
            if not (valid(s["forward_pe"]) and valid(s["price"])):
                missing.append(t)
                continue
            w.writerow({"date": today, "ticker": t, **{k: "" if v is None else v for k, v in s.items()}})
    if missing:
        print("No usable forward P/E for:", ", ".join(missing))
    return missing


if __name__ == "__main__":
    main()
