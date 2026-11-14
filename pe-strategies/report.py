"""Standard test report: P/E mean-reversion strategy vs buy-and-hold vs SPY/QQQ.

    python report.py --ticker AAPL --benchmark SPY        # saves results/AAPL_vs_SPY.png
Standard test: 5y average, enter on a cross below 1.0x, exit at 1.2x, 5 bps per side, filled at the next close.
"""
import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

from strategy import backtest, load_pe, signal, stats

HERE = Path(__file__).parent
STANDARD = dict(lookback_years=5.0, entry=1.0, exit_mult=1.2, cost_bps=5.0, delay_days=1)
BLUE, GREY, RED, GREEN, GOLD = "#1f6feb", "#8b949e", "#d64545", "#2ea66f", "#d4a017"


def load_pe_series(ticker, source="trailing", pe_csv=None):
    if source == "forward":
        return load_pe(HERE / "data" / "forward_pe.csv", ticker)
    if source == "trailing":
        f = HERE / "data" / f"trailing_{ticker.upper()}.csv"
        if not f.exists():  # builds it from SEC EDGAR (needs SEC_USER_AGENT, see trailing_pe.py)
            from trailing_pe import build
            f.parent.mkdir(exist_ok=True)
            build(ticker).to_csv(f)
        return pd.read_csv(f, parse_dates=["date"], index_col="date")["pe"].dropna()
    return pd.read_csv(pe_csv, parse_dates=["date"], index_col="date")["pe"].dropna()


def get_prices(tickers, start):
    import yfinance as yf
    p = yf.download(list(tickers), start=str(start), auto_adjust=True, progress=False)["Close"]
    p = p.to_frame(tickers[0]) if isinstance(p, pd.Series) else p
    p.index = pd.to_datetime(p.index).tz_localize(None)
    return p


def run(ticker, benchmark="SPY", source="trailing", pe_csv=None, pe=None, px=None, **params):
    P = {**STANDARD, **params, "source": source}
    pe = load_pe_series(ticker, source, pe_csv) if pe is None else pe
    sig = signal(pe, P["lookback_years"], P["entry"], P["exit_mult"])
    start = sig["ratio"].first_valid_index()
    if start is None:
        raise SystemExit(f"Not enough P/E history for a {P['lookback_years']:g}y average ({len(pe)} days).")
    if px is None:
        px = get_prices(list(dict.fromkeys([ticker, benchmark])), pe.index[0])
    bt = backtest(sig, px[ticker], P["cost_bps"], P["delay_days"])
    bt = bt[bt.index >= start]
    bench = px[benchmark].reindex(bt.index).ffill().pct_change().fillna(0)
    rets = pd.DataFrame({"Strategy": bt.strategy, f"{ticker} buy & hold": bt.buy_hold, f"{benchmark} buy & hold": bench})
    return sig.loc[start:], bt, rets, P


def trades(bt):
    inv = bt.position == 1
    grp = (inv != inv.shift()).cumsum()
    rows = [{"Entry": s.index[0].date(), "Last day held": "still open" if s.index[-1] == bt.index[-1] else s.index[-1].date(),
             "Days": len(s), "Return": (1 + s.buy_hold).prod() - 1} for _, s in bt[inv].groupby(grp[inv])]
    return pd.DataFrame(rows, columns=["Entry", "Last day held", "Days", "Return"])


def summary(bt, rets):
    rows = {c: stats(rets[c]) for c in rets}
    rows["Strategy"]["Time in market"] = bt.position.mean()
    rows["Strategy"]["Trades"] = len(trades(bt))
    return pd.DataFrame(rows)


def plot(sig, bt, rets, P, ticker, benchmark):
    plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                         "grid.alpha": 0.25, "font.size": 10})
    fig = plt.figure(figsize=(11, 11.5))
    gs = fig.add_gridspec(4, 1, height_ratios=[2.2, 2.6, 1.3, 1.5], hspace=0.4)
    a1, a2, a3, a4 = (fig.add_subplot(gs[i]) for i in range(4))
    a1.plot(sig.pe, color=BLUE, lw=1.2, label="P/E")
    a1.plot(sig.avg, color=GREY, lw=1.3, label=f"{P['lookback_years']:g}y average (entry: cross below {P['entry']:.1f}x)")
    a1.plot(sig.avg * P["exit_mult"], color=RED, lw=1, ls="--", label=f"exit at {P['exit_mult']:.1f}x average")
    inv = bt.position.reindex(sig.index).fillna(0) > 0
    a1.fill_between(sig.index, 0, 1, where=inv, transform=a1.get_xaxis_transform(), color=GREEN, alpha=0.18, label="invested")
    a1.set_title(f"{ticker} P/E vs its average", loc="left", fontsize=11)
    a1.legend(loc="upper left", fontsize=8, ncol=2, frameon=False)
    cum = (1 + rets).cumprod()
    for col, color, lw in zip(cum, [BLUE, GREY, GOLD], [2.2, 1.4, 1.4]):
        a2.plot(cum[col], color=color, lw=lw, label=col)
    a2.set_title("Growth of 1 (net of costs, dividends reinvested)", loc="left", fontsize=11)
    a2.legend(loc="upper left", frameon=False)
    dd = cum / cum.cummax() - 1
    for col, color in zip(dd, [BLUE, GREY, GOLD]):
        a3.plot(dd[col], color=color, lw=1)
    a3.set_title("Drawdown", loc="left", fontsize=11)
    a3.yaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
    tbl = summary(bt, rets)
    fmt = {"CAGR": "{:.1%}", "Vol": "{:.1%}", "Sharpe (rf=0)": "{:.2f}", "Max DD": "{:.1%}", "Time in market": "{:.0%}", "Trades": "{:.0f}"}
    cells = [[fmt[k].format(v) if pd.notna(v) else "-" for v in tbl.loc[k]] for k in tbl.index]
    a4.axis("off")
    t = a4.table(cellText=cells, rowLabels=list(tbl.index), colLabels=list(tbl.columns), loc="center", cellLoc="center")
    t.scale(1, 1.5)
    fig.suptitle(f"{ticker}: P/E mean reversion vs {benchmark}", x=0.07, ha="left", fontsize=14, fontweight="bold", y=0.955)
    fig.text(0.07, 0.925, f"{P['source']} P/E · enter on cross below {P['entry']:.1f}x avg · exit at {P['exit_mult']:.1f}x · {P['cost_bps']:g} bps/side · "
             f"filled {P['delay_days']} close later · {rets.index[0]:%Y-%m-%d} → {rets.index[-1]:%Y-%m-%d} · long-only, cash earns 0%",
             fontsize=8, color=GREY)
    return fig


def main():
    import matplotlib
    matplotlib.use("Agg")
    a = argparse.ArgumentParser()
    a.add_argument("--ticker", required=True)
    a.add_argument("--benchmark", choices=["SPY", "QQQ"], default="SPY")
    a.add_argument("--source", choices=["trailing", "forward", "csv"], default="trailing")
    a.add_argument("--pe-csv")
    a.add_argument("--lookback-years", type=float, default=STANDARD["lookback_years"])
    a.add_argument("--entry", type=float, default=STANDARD["entry"])
    a.add_argument("--exit", type=float, default=STANDARD["exit_mult"], dest="exit_mult")
    a.add_argument("--cost-bps", type=float, default=STANDARD["cost_bps"])
    q = a.parse_args()
    sig, bt, rets, P = run(q.ticker, q.benchmark, q.source, q.pe_csv, lookback_years=q.lookback_years,
                           entry=q.entry, exit_mult=q.exit_mult, cost_bps=q.cost_bps)
    out = HERE / "results" / f"{q.ticker.upper()}_vs_{q.benchmark}.png"
    out.parent.mkdir(exist_ok=True)
    plot(sig, bt, rets, P, q.ticker.upper(), q.benchmark).savefig(out, dpi=150, bbox_inches="tight")
    print(summary(bt, rets).round(3), "\n", trades(bt).round(3), f"\nSaved {out}", sep="\n")
    if len(trades(bt)) < 5:
        print("WARNING: fewer than 5 trades. This is an anecdote, not evidence.")


if __name__ == "__main__":
    main()
