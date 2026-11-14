import numpy as np
import pandas as pd

import log_pe
from strategy import backtest, signal


def series():
    idx = pd.bdate_range("2020-01-01", periods=420)
    v = np.r_[np.full(300, 20.0), np.full(20, 17.0), np.linspace(17, 26, 100)]
    return pd.Series(v, index=idx)


def test_enters_on_cross_below_and_exits_at_20pct_above():
    s = signal(series(), lookback_years=1)["state"]
    assert s.iloc[:300].sum() == 0
    assert s.iloc[300] == 1                      # first day below average
    assert s.iloc[-1] == 0 and s.max() == 1      # exited once ratio reached 1.2


def test_no_entry_when_starting_below_average():
    pe = pd.Series(np.linspace(30, 10, 400), index=pd.bdate_range("2020-01-01", periods=400))  # always below its lagging average
    assert signal(pe, 1)["state"].sum() == 0     # needs a cross, not just "below"


def test_no_lookahead_and_costs():
    sig = signal(series(), 1)
    px = pd.Series(np.linspace(100, 130, len(sig)), index=sig.index)
    bt = backtest(sig, px, cost_bps=5, delay_days=1)
    assert bt.position.loc[:sig.state.idxmax()].sum() == 0          # flat until signal day
    assert bt.position.iloc[list(sig.index).index(sig.state.idxmax()) + 2] == 1   # filled 2 closes later
    free = backtest(sig, px, cost_bps=0)
    assert bt.strategy.sum() < free.strategy.sum()


def test_too_little_history_gives_no_signal():
    pe = pd.Series(20.0, index=pd.bdate_range("2024-01-01", periods=100))
    assert signal(pe, 5)["ratio"].notna().sum() == 0


def test_logger_idempotent_and_skips_invalid(tmp_path, monkeypatch):
    monkeypatch.setattr(log_pe, "OUT", tmp_path / "x.csv")
    good = {"price": 100, "forward_pe": 20.0, "forward_eps": 5, "trailing_pe": 22, "trailing_eps": 4.5}
    monkeypatch.setattr(log_pe, "snapshot", lambda t: good if t == "AAA" else {**good, "forward_pe": None})
    assert log_pe.main(["AAA", "BBB"], today="2026-10-26") == ["BBB"]
    log_pe.main(["AAA", "BBB"], today="2026-10-26")
    assert len(pd.read_csv(tmp_path / "x.csv")) == 1
