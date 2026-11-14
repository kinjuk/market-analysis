"""Forward P/E mean reversion: go long when P/E crosses below its N-year average,
exit when it reaches `exit_mult` x that average. Long-only, cash otherwise (0% return)."""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def load_pe(path, ticker):
    d = pd.read_csv(path, parse_dates=["date"])
    d = d[d.ticker == ticker].drop_duplicates("date").set_index("date").sort_index()
    return d["forward_pe"].astype(float)


def signal(pe, lookback_years=5.0, entry=1.0, exit_mult=1.2, min_coverage=0.9):
    """state=1 means long after that day's close. Entry needs an actual CROSS below `entry` x average."""
    avg = pe.rolling(f"{int(lookback_years * 365.25)}D", min_periods=int(lookback_years * 252 * min_coverage)).mean()
    ratio = pe / avg
    state, cur = np.zeros(len(pe)), 0
    for i in range(len(pe)):
        r = ratio.iloc[i]
        if np.isnan(r):
            cur = 0
        else:
            p = ratio.iloc[i - 1] if i else np.nan
            if cur == 0 and not np.isnan(p) and p >= entry and r < entry:
                cur = 1
            elif cur == 1 and r >= exit_mult:
                cur = 0
        state[i] = cur
    return pd.DataFrame({"pe": pe, "avg": avg, "ratio": ratio, "state": state}, index=pe.index)


def backtest(sig, prices, cost_bps=5.0, delay_days=1):
    """Signal is known after the close, so it is filled `delay_days` closes later: no look-ahead."""
    px = prices.reindex(sig.index).ffill().dropna()
    ret = px.pct_change().fillna(0)
    pos = sig["state"].reindex(px.index).fillna(0).shift(1 + delay_days).fillna(0)
    strat = pos * ret - pos.diff().abs().fillna(0) * cost_bps / 1e4
    return pd.DataFrame({"strategy": strat, "buy_hold": ret, "position": pos})


def stats(r, ppy=252):
    cum = (1 + r).cumprod()
    sd = r.std()
    return {"CAGR": cum.iloc[-1] ** (ppy / len(r)) - 1, "Vol": sd * np.sqrt(ppy),
            "Sharpe (rf=0)": r.mean() / sd * np.sqrt(ppy) if sd > 0 else 0.0, "Max DD": (cum / cum.cummax() - 1).min()}


def main():
    import yfinance as yf
    a = argparse.ArgumentParser()
    a.add_argument("--ticker", default="SPY")
    a.add_argument("--source", choices=["forward", "trailing", "csv"], default="forward",
                   help="forward: logged live data · trailing: data/trailing_<TICKER>.csv from trailing_pe.py · csv: --pe-csv with date,pe")
    a.add_argument("--pe-csv", default=None)
    a.add_argument("--data", default=str(Path(__file__).parent / "data" / "forward_pe.csv"))
    a.add_argument("--lookback-years", type=float, default=5.0)
    a.add_argument("--entry", type=float, default=1.0)
    a.add_argument("--exit", type=float, default=1.2, dest="exit_mult")
    a.add_argument("--cost-bps", type=float, default=5.0)
    q = a.parse_args()
    here = Path(__file__).parent / "data"
    if q.source == "forward":
        pe = load_pe(q.data, q.ticker)
    elif q.source == "trailing":
        pe = pd.read_csv(here / f"trailing_{q.ticker.upper()}.csv", parse_dates=["date"], index_col="date")["pe"].dropna()
    else:
        pe = pd.read_csv(q.pe_csv, parse_dates=["date"], index_col="date")["pe"].dropna()
    print(f"{q.source} P/E · {q.ticker}: {len(pe)} logged days ({pe.index[0].date()} → {pe.index[-1].date()})")
    sig = signal(pe, q.lookback_years, q.entry, q.exit_mult)
    if sig["ratio"].notna().sum() == 0:
        need = int(q.lookback_years * 252 * 0.9) - len(pe)
        print(f"Not enough history for a {q.lookback_years:g}y average: about {need} more trading days needed."); return
    px = yf.download(q.ticker, start=str(pe.index[0].date()), auto_adjust=True, progress=False)["Close"].squeeze()
    bt = backtest(sig, px, q.cost_bps)
    bt = bt[bt.index >= sig["ratio"].first_valid_index()]
    print(pd.DataFrame({"Strategy": stats(bt.strategy), "Buy & hold": stats(bt.buy_hold)}).round(3))
    trades = int((bt.position.diff() > 0).sum())
    print(f"Trades: {trades} · time in market: {bt.position.mean():.0%} · current ratio: {sig['ratio'].iloc[-1]:.2f}")
    if trades < 5:
        print("WARNING: fewer than 5 trades. This is an anecdote, not evidence.")


if __name__ == "__main__":
    main()
