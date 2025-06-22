# A VIX Regression Mean-Deviation Strategy

The VIX doesn’t just reflect fear, it exaggerates it. While price action unfolds gradually, volatility often reacts in dramatic bursts. This creates the conditions for statistical mean reversion. Rather than chasing VIX spikes, this strategy frames them as deviations from a regression line which represents or aims to represent fair value. The goal is not to forecast direction but to respond to abnormal volatility shocks with a market stability thesis. When VIX moves in a way that exceeds a regression-based expectation, it often represents an overreaction rather than a new trend. This strategy aims to exploit those overreactions by trading VIX futures both long and short when price strays too far from its mean.

## Assets Traded
- VIX Futures (long / short positions allowed)

## Signal Construction

- Fit a linear regression line to the trailing 120 days of VIX values  
- Predict today’s expected VIX value based on that regression  
- Measure percent deviation of actual VIX from predicted value:  

  `(VIX_actual - VIX_predicted) / VIX_predicted * 100`

- **Short Signal**: If VIX exceeds the predicted value by more than +10%  
- **Long Signal**: If VIX falls more than -10% below the predicted value

## Entry Logic

- Enter short or long VIX futures at close on the day of the signal, depending on whether deviation is positive or negative.

## Exit Logic

- Close position when VIX returns to within 2% of the regression line  
**OR**  
- Max holding period of 60 trading days is reached

## Risk Management

- 3% stop-loss from VIX entry level  
- Max holding period: 60 trading days  
- *(Optional cooldown period after any stop-out: 5 trading days)*

## Edge Hypothesis

VIX frequently overshoots or undershoots its trend due to market reflexes and panic hedging. These overreactions tend to dissipate and mean-revert quickly, mostly in non-crisis environments. This strategy attempts to isolate short-term dislocations that are inconsistent with fundamental macro market thesis.

## Backtest Notes

- Strategy is sensitive to regression window — shorter windows may be more reactive but noisier  
- Most effective in choppy or sideways markets  
- May underperform in trending markets where fear or complacency is justified and prolonged  
- Useful when paired with volatility filters or macro overlays to confirm conditions
