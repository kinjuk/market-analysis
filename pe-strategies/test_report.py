import matplotlib

matplotlib.use("Agg")
import numpy as np
import pandas as pd

from report import plot, run, summary, trades


def data():
    idx = pd.bdate_range("2020-01-01", periods=420)
    pe = pd.Series(np.r_[np.full(300, 20.0), np.full(20, 17.0), np.linspace(17, 26, 100)], index=idx)
    px = pd.DataFrame({"AAA": np.linspace(100, 140, 420), "SPY": np.linspace(300, 360, 420)}, index=idx)
    return pe, px


def test_run_trades_and_summary():
    pe, px = data()
    sig, bt, rets, P = run("AAA", "SPY", pe=pe, px=px, lookback_years=1)
    t = trades(bt)
    assert len(t) == 1 and t.Return.iloc[0] > 0
    assert set(rets.columns) == {"Strategy", "AAA buy & hold", "SPY buy & hold"}
    assert summary(bt, rets).loc["Trades", "Strategy"] == 1


def test_plot_saves(tmp_path):
    pe, px = data()
    sig, bt, rets, P = run("AAA", "SPY", pe=pe, px=px, lookback_years=1)
    plot(sig, bt, rets, P, "AAA", "SPY").savefig(tmp_path / "x.png")
    assert (tmp_path / "x.png").stat().st_size > 10_000
