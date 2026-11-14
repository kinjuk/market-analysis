import numpy as np
import pandas as pd

from trailing_pe import quarters, ttm_series


def fact(s, e, v, f):
    return {"start": s, "end": e, "val": v, "filed": f}


FACTS = [fact("2020-01-01", "2020-03-31", 1.0, "2020-05-01"), fact("2020-04-01", "2020-06-30", 1.0, "2020-08-01"),
         fact("2020-07-01", "2020-09-30", 1.0, "2020-11-01"), fact("2020-01-01", "2020-12-31", 5.0, "2021-02-15"),
         fact("2020-01-01", "2020-03-31", 9.9, "2021-05-01"),            # restatement: must be ignored
         fact("2020-01-01", "2020-06-30", 2.0, "2020-08-01"),            # YTD duration: must be ignored
         fact("2021-01-01", "2021-03-31", 1.5, "2021-05-01")]


def test_q4_derived_and_restatement_ignored():
    q = quarters(FACTS)
    assert q.val.tolist() == [1.0, 1.0, 1.0, 2.0, 1.5]


def test_ttm_is_point_in_time():
    q = quarters(FACTS)
    t = ttm_series(q, pd.to_datetime(["2020-12-01", "2021-03-01", "2021-06-01"]))
    assert np.isnan(t.iloc[0])                 # only 3 quarters public
    assert t.iloc[1] == 5.0                    # Q4 only usable after the 10-K was filed
    assert t.iloc[2] == 5.5


def test_split_adjustment():
    q = quarters(FACTS)
    sp = pd.Series([2.0], index=pd.to_datetime(["2020-09-01"]))
    t = ttm_series(q, pd.to_datetime(["2021-03-01"]), sp)
    assert t.iloc[0] == 0.5 + 0.5 + 1.0 + 2.0  # quarters filed before the split are halved
