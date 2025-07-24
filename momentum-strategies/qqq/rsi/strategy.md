# RSI-Based QQQ Mean Reversion Strategy

This strategy is built on the assumption that momentum extremes, as measured by the Relative Strength Index (RSI), tend to revert over time. Rather than chasing breakouts, this system waits for overbought or oversold RSI conditions and aims to profit from short-term reversals.
It uses a daily timeframe with RSI as the single indicator seeking to exploit price exhaustion in trending moves. The goal isn't to predict the trend but simply to enter when the risk-reward shifts favor reversion.

## Strategy Rules

### Assets Traded
- QQQ (short / long)

### Signal Construction
- Calculate the 14-day RSI on SPY using daily closing prices.  
- **Overbought Signal:** RSI > 70  
- **Oversold Signal:** RSI < 30  

### Entry Logic
- If RSI > 70 → **Enter Short SPY** at close.  
- If RSI < 30 → **Enter Long SPY** at close.  
- If RSI is between 30 and 70 → No trade. Stay out of the market.

### Exit Logic
- Exit any open trade once RSI comes back to 60 (50 midpoint + 10 to compensate for the upward bias in the market).  
  This reflects a return to "pseudo-neutral" conditions, signaling the end of the short-term overbought/oversold condition.

### Risk Management
- A 15% stop-loss from entry is also enforced to guard against extreme moves (breakouts).  
- In cash when while RSI between 30 and 70.  
- One position at a time (no overlapping long and short trades).

## Edge Hypothesis

The RSI is designed to identify momentum exhaustion. When RSI enters extreme zones (for all intents and purposes in this strategy: above 70 or below 30), it often signals short-term overextension meaning that price will revert toward a neutral RSI level, which is supported by most momentum oscillator backtest results.
The idea is to **fade strength or weakness** at points where continuation is statistically less likely (mean-reverting regime).

## Backtest Notes

- Strategy should theoretically performs best in sideways or choppy environments where price frequently returns to a central value.  
- It may underperform in strong directional markets where RSI stays overbought or oversold for extended periods.  
- The strategy avoids whipsaw in neutral conditions by requiring clear signals (RSI > 70 or < 30).  
- Performance can be improved by combining this model with filters (macro trend filters or volatility regime classifiers).  
- **Comparison Benchmark:** An alternative comparison model uses a **QQQ Buy & Hold core allocation** with **temporary leverage overlays** based on *RSI < 30*.  
  This hybrid seeks to increase exposure during oversold conditions without exiting the market completely. It offers a middle ground between passive investing and active mean-reversion. This strategy **is implemented in the code** as a reference point to compare performance, risk, and responsiveness to momentum extremes.
