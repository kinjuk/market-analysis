"""Writes app/test/fixtures.json: synthetic inputs + the Python engine's answers, so engine.js can be checked against them."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from report import run, summary, trades  # noqa: E402
from strategy import signal  # noqa: E402

CASES = [{}, dict(lookbackYears=1, entry=.95, exitMult=1.15), dict(lookbackYears=3, delayDays=0, costBps=0),
         dict(lookbackYears=2, entry=1.05, exitMult=1.3, delayDays=2, costBps=25)]
DEFAULTS = dict(lookbackYears=5, entry=1.0, exitMult=1.2, costBps=5, delayDays=1)


def synthetic(seed=7):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2012-01-02", "2024-12-31")
    n = len(idx)
    noise = np.zeros(n)
    for i in range(1, n):
        noise[i] = 0.995 * noise[i - 1] + rng.normal(0, .3)
    pe = pd.Series(18 + 4 * np.sin(np.arange(n) / 400) + noise, index=idx).clip(6)
    pe.iloc[900:1020] = np.nan                                       # negative-earnings stretch
    px = pd.DataFrame({"AAA": 100 * np.exp(np.cumsum(rng.normal(4e-4, .014, n))),
                       "BBB": 100 * np.exp(np.cumsum(rng.normal(4e-4, .010, n)))}, index=idx)
    px.iloc[rng.choice(n, 40, replace=False), 1] = np.nan             # benchmark missing on some days
    return pe, px


clean = lambda a: [None if pd.isna(x) else float(x) for x in a]
d = lambda ts: [t.strftime("%Y-%m-%d") for t in ts]


def main():
    pe, px = synthetic()
    bench = px["BBB"].dropna()
    out = {"stock": {"dates": d(px.index), "adj_close": px["AAA"].tolist(), "pe": clean(pe)},
           "bench": {"dates": d(bench.index), "adj_close": bench.tolist(), "pe": None}, "cases": []}
    for c in CASES:
        p = {**DEFAULTS, **c}
        full = signal(pe, p["lookbackYears"], p["entry"], p["exitMult"])
        sig, bt, rets, _ = run("AAA", "BBB", pe=pe, px=px, lookback_years=p["lookbackYears"], entry=p["entry"],
                               exit_mult=p["exitMult"], cost_bps=p["costBps"], delay_days=p["delayDays"])
        tbl = summary(bt, rets)
        col = lambda name: {"cagr": tbl.loc["CAGR", name], "vol": tbl.loc["Vol", name],
                            "sharpe": tbl.loc["Sharpe (rf=0)", name], "maxDD": tbl.loc["Max DD", name]}
        t = trades(bt)
        out["cases"].append({
            "params": p, "start": str(sig.index[0].date()), "avg": clean(full["avg"]), "state": full["state"].astype(int).tolist(),
            "stats": {"strategy": col("Strategy"), "hold": col("AAA buy & hold"), "bench": col("BBB buy & hold")},
            "timeInMarket": float(tbl.loc["Time in market", "Strategy"]),
            "trades": [{"entry": str(r.Entry), "last": None if r._2 == "still open" else str(r._2), "open": r._2 == "still open",
                        "days": int(r.Days), "ret": float(r.Return)} for r in t.itertuples()]})
    (Path(__file__).parent / "fixtures.json").write_text(json.dumps(out, allow_nan=False))
    print("fixtures written:", [len(c["trades"]) for c in out["cases"]], "trades per case")


if __name__ == "__main__":
    main()
