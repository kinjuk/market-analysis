import numpy as np
import pandas as pd

import build_data as B
from trailing_pe import ttm_series


def test_pe_from_ttm_drops_nonpositive_eps():
    px = pd.Series([100.0, 100.0, 100.0])
    pe = B.pe_from_ttm(px, pd.Series([5.0, 0.0, -2.0]))
    assert pe.iloc[0] == 20 and pe.iloc[1:].isna().all()


def test_shiller_proxy_is_lagged_and_stops_when_earnings_stop(tmp_path):
    months = pd.date_range("2020-01-01", periods=12, freq="MS")
    eps = [10, 11, 12, 13, 14, 15, 16, 0, 0, 0, 0, 0]   # earnings unpublished after July
    f = tmp_path / "s.csv"
    pd.DataFrame({"Date": months, "Earnings": eps}).to_csv(f, index=False)
    close = pd.Series(100.0, index=pd.bdate_range("2020-01-01", "2020-12-31"))
    pe = B.shiller_pe(close, source=f, lag_months=3)
    assert pe.loc["2020-04-01"] == 100 / 10                 # April uses January's earnings
    assert pe.loc["2020-05-04"] == 100 / 11
    assert pe.loc["2020-12-30"] != pe.loc["2020-12-30"]     # NaN: proxy ends, no stale carry-forward


def test_payload_schema_and_nulls():
    idx = pd.bdate_range("2024-01-01", periods=5)
    h = pd.DataFrame({"Close": [1, 2, 3, 4, 5.0], "Adj Close": [1, 2, 3, 4, 5.0]}, index=idx)
    p = B.payload("X", h, pd.Series([np.nan, np.nan, 10, 11, 12.0], index=idx), "yahoo")
    assert len(p["dates"]) == len(p["adj_close"]) == len(p["pe"]) == 5 and p["pe"][0] is None and p["pe"][2] == 10
    assert B.payload("Q", h, None, "none")["pe"] is None


def test_yahoo_style_quarters_need_wider_span():
    ends = pd.to_datetime(["2023-02-02", "2023-05-04", "2023-08-03", "2023-11-02"])  # ~273 days apart
    q = pd.DataFrame({"end": ends, "val": [1.0, 1.0, 1.0, 1.0], "filed": ends})
    d = pd.to_datetime(["2023-12-01"])
    assert ttm_series(q, d, span_days=330).iloc[0] == 4.0
    long_q = q.copy(); long_q["end"] = long_q["filed"] = pd.to_datetime(["2023-01-01", "2023-05-01", "2023-09-01", "2024-01-01"])
    assert np.isnan(ttm_series(long_q, pd.to_datetime(["2024-02-01"]), span_days=330).iloc[0])
