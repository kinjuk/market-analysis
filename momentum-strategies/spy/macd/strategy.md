# MACD-Based SPY Momentum Strategy

This strategy is built on the principle that momentum trends, as captured by the Moving Average Convergence Divergence (MACD) indicator, can be exploited for trend-following profits. It uses a daily timeframe with MACD as the single indicator seeking to identify trend changes and ride momentum moves.

## Strategy Rules

### Assets Traded
- SPY (long / short)

### Signal Construction
- Calculate the MACD line as the difference between the 12-day EMA and 26-day EMA of SPY closing prices.  
- Calculate the Signal line as the 9-day EMA of the MACD line.  
- **Buy Signal:** MACD line crosses above Signal line  
- **Sell Signal:** MACD line crosses below Signal line  

### Entry Logic
- When MACD crosses **above** Signal → **Enter Long SPY** at close.  
- When MACD crosses **below** Signal → **Enter Short SPY** at close.  
- Hold the current position until an opposite crossover signal occurs.

### Exit Logic
- Exit long positions on a **sell signal** (MACD crosses below Signal).  
- Exit short positions on a **buy signal** (MACD crosses above Signal).

### Risk Management
- Enforce a 5% stop-loss from entry price to limit downside risk.  
- Only one open position at a time (no overlapping long and short trades).  
- Stay in cash between trades.

## Edge Hypothesis

MACD is a trend-following momentum indicator that highlights changes in the strength, direction, and duration of a trend. Crossovers of the MACD line with its Signal line are used as timely signals of potential trend reversals or continuations.

This strategy aims to **capture sustained moves** in SPY by entering positions aligned with momentum shifts rather than trying to predict turning points in advance.

## Backtest Notes

- Performs best in trending markets where momentum persists.  
- Can suffer during sideways or choppy price action, causing whipsaws on frequent crossovers.  
- Risk management via stop-loss is critical to avoid large losses during false signals or trend failures.  
- Performance can be improved by combining with filters, such as volatility regimes or volume confirmation.  
- **Comparison Benchmark:** Buy & Hold SPY to evaluate whether trend-following adds value over passive exposure.
- **Comparison Benchmark 2:** Hybrid MACD Longs + Buy & Hold SPY to see if it can improve and outperform the market.
