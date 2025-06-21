A VIX Regression Mean-Deviation Strategy

The VIX doesn’t just reflect fear, it exaggerates it. While price action unfolds gradually, volatility often reacts in dramatic bursts. This creates the conditions for statistical mean reversion. Rather than chasing VIX spikes, this strategy frames them as deviations from a regression line which represents or aims to represent fair value.
The goal is not to forecast direction but to respond to abnormal volatility shocks with a market stability thesis. When VIX moves in a way that exceeds a regression-based expectation, it often represents an overreaction rather than a new trend. This strategy aims to exploit those overreactions by trading VIX futures both long and short when price strays too far from its mean.

1. Assets Traded:  
VIX Futures (long / short positions allowed) 
  
2. Signal Construction:  
 - Fit a linear regression line to the trailing 120 days of VIX values

 - Predict today’s expected VIX value based on that regression

 - Measure percent deviation of actual VIX from predicted value:

      (VIX_actual - VIX_predicted) / VIX_predicted * 100

 - Short Signal: If VIX exceeds the predicted value by more than +10%

 - Long Signal: If VIX falls more than -10% below the predicted value
