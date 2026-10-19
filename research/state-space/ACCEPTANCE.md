# Forecast layer on the state-space ratings: acceptance rule (written before any training)

Goal: the forecast heads read the state-space ratings instead of the Elo-style ones, so one rating system serves the
whole site. This is a unification, not an accuracy project, so the bar is "not materially worse".

Design (frozen):
- Same selected head designs as the shipped heads (`research/selection.json`), no new search.
- Inputs that change: `baseline*`, `race_driver`, `race_car`, `qual_driver`, `qual_car`. Everything else (form
  trackers, grid, qualifying, context) is computed exactly as before.
- Ratings come from the state-space filter as forecast before each weekend (after the time update, before the
  weekend's own observations). Gap = driver level + car level; baseline probability = fitted slope on the gap, then the
  hazard mix the shipped heads used. No circuit affinity in the baseline.
- Heads fitted for forecasts from 2008 (data through 2007), 2012 (through 2011), 2016 (through 2015).

Acceptance (selection years only, 2008-2011 and 2012-2015 pooled, same observations and weights, season-block view):
1. race-day combined and Thursday combined log-loss of the new heads no worse than the shipped heads by more than 0.001;
2. qualifying head no worse by more than 0.001;
3. no regression larger than 0.002 in either 4-year window on its own.

If a rule fails, the heads are not shipped and the forecast layer keeps its current inputs. Nothing is tuned after
seeing 2016 onward; those years are scored last, once, and reported as a second look (that window has already been
read once for the ratings).
