# From Overperforming to Underperforming the S&P 500

One key observation was that until early 2020, the VIX mean-reversion strategy outperformed SPY. Coinciding with the COVID-19 crisis and the following recession in 2021 and 2022.  
While COVID-19 possibily triggered the initial divergence, the continued underperformance suggests a lasting shift in volatility behavior, possibly due to:

- More accentuated market trending directions  
- Ongoing macro shocks  
- Repeated Fed interventions  
- Structural changes in the VIX derivatives market (such as: increased options hedging demand, volume targeting funds)

---

## Questioning and looking for alternatives like:

- Did the strategy not adapt to overall market dinamics changes?  
- Is adding a volatility regime classifier a possible fix (e.g., if VIX > 30 , then avoid trading)?  
- Are there new "mean levels" of volatility post-2020?  
- Should the regression model be recalibrated to only use post-2020 data?  
- Would dynamically adjusting the regression window improve adaptability?

---

Keeping in mind that overfitting to 2020–2024 might not guarantee a strategy that generalizes well over time. Still, it's important to acknowledge that the assumptions behind VIX mean-reversion may no longer hold without refinement.
