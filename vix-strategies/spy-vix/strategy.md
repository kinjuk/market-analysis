Riding the Fear Curve: A SPY/VIX Divergence Strategy

When uncertainty rises, the VIX tends to spikes dramatically, while equity indices like the S&P 500 tend to drop. This is well-known but what’s more interesting is that VIX tends to lead, while SPY tends to lag. The resulting divergence has historically signaled inflection points where fear gets ahead of actual price damage (short-term signal).
This is not a new phenomenon. During the COVID crash, for instance, VIX soared above 80 while SPY collapsed in a straight line. But a closer look reveals smaller divergences in calmer periods, which can be used to time entries or exits on a shorter time horizon. This strategy doesn’t try to predict the future. Instead, it responds to the relationship between the implied volatility and price behavior of the S&P 500. It's not about the VIX alone, it's about how fast the VIX is rising or falling relative to what SPY is doing and how soon it will reflect market-fear (relative-value trading).

Strategy Rules

1. Assets Traded:  
SPY (short-only)  
VIX is used as a signal but not traded directly.  
  
2. Signal Construction:  
Calculate the daily percentage change in VIX.  
Calculate the daily percentage change in SPY over the same day.  
If VIX rises by 20% or more on a given day, and SPY declines by 2.5% or more, this signals a potential fear spike divergence.  
  
3. Entry Logic:  
Enter short SPY at close on divergence signal.  
Optionally scale in if the divergence widens the next day.
If SPY drops by 5% or more on any single day, initiate an immediate short regardless of VIX behavior.  
  
4. Exit Logic:  
Close position when SPY dips by > 2% from entry  
OR  
VIX declines by at least 5%, showing a negative daily return.  
  
5. Risk Management:  
2% stop-loss from entry  
Max holding period: 13 trading days   
No re-entry within 10 days of a stopped-out trade to reduce signal noise in choppy markets.  
  
6. Edge Hypothesis:  
The market tends to overreact to uncertainty faster than actual price deterioration occurs. SPY often rebounds once fear overshoots.  
  
7. Backtest Notes:  
Strategy performs best in sideways to declining volatility regimes, and may underperform during strong trends or prolonged risk-off events.  
More accurate on indices like SPY (where VIX is directly derived), and less so for other ETFs unless paired with appropriate volatility metrics.  
