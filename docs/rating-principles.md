# Rating behavior contract

These principles describe the intended behavior of the driver and car rating model. They are behavioral constraints, not assumptions about a particular implementation.

- A controlled teammate result changes the drivers' relative rating in the direction of the result. Reversing only that result reverses the contribution.
- Given the same prior uncertainty and evidence quality, an unexpected result produces a larger result contribution than an expected result.
- Results that repeatedly favor one team can support a shared car improvement. Teammate comparisons still distinguish the drivers, so changing the teammate can change the driver comparison.
- A mechanical retirement without pace evidence does not count as poor pace. Valid laps before the retirement remain pace evidence; reliability is updated separately from pace.
- Qualifying evidence and race evidence have traceable paths into forecasts and ratings. Changing one session's evidence does not silently rewrite the other session's observations.
- In production, qualifying driver levels feed the race filter; qualifying car levels do not. The filter/online estimate uses a 48% race-filter, 32% qualifying-filter and 20% online-comparison blend. Published race and qualifying driver levels each include 5% of the recent teammate graph; the qualifying-driver link is stated separately from those blend shares.
- A rating or forecast at a date uses no later evidence. Appending future weekends leaves every earlier prefix unchanged.
- A change of team does not alter the portable driver prior mean or add driver variance, change learning rates or apply a likelihood multiplier. Ordinary time drift applies equally to movers and stayers. A separate equipment-specific fit can reset for a new car. With weak evidence to separate driver from car, uncertainty remains.
- Renaming entities, reordering rows or pair representations, and swapping the two sides of an observation preserve the equivalent result.
- Pairwise comparisons from one weekend are dependent representations of a shared event. Their combined influence is tempered rather than treated as independent races. Ingestion removes exact duplicate source rows while retaining distinct records for one driver and race.
- Sustained evidence can move ratings, while a single noisy observation does not make the model permanently insensitive or arbitrarily decisive.
- Outcome forecasts specify whether they describe running pace or finishing ahead including retirements. They must be informative and calibrated, judged by proper probability scores as well as calibration, with complementary probabilities when a binary outcome is reversed.
- Evidence quality and prior uncertainty govern learning. Sparse or weakly connected histories do not justify confident driver–car attribution.
- Long-term ratings describe persistent ability. Short-term form is a hypothesis about temporary predictive deviations; it is retained only when it adds reproducible value beyond appropriately responsive ratings. Driver form is not defined by a forced zero sum within a team.
- Every additional mechanism must justify its complexity through predictive evidence or an explicit user-selected stability tradeoff with measured costs. Historical diagnostic targets do not compensate for failed behavioral requirements or materially worse outcome forecasts.

The graph must attach each comparison to the drivers’ strengths during the period when they were teammates, rather than treating one driver as an unchanged career-long node. Later results cannot rewrite earlier published snapshots.

Transfer prediction is assessed from a frozen pre-move prior. Faster adjustment after joining is a separate adaptation diagnostic and cannot count as better portability.

The graph additionally requires calendar recency weighting, uncapped effective information from valid shared races, and greater information for a direct comparison than an otherwise equivalent indirect path.

Synthetic tests exercise the filter and production hybrid-rating path, including the driver-only qualifying-to-race link, the absence of a qualifying-car route into the race filter, and the published source blend. They do not require a specific rating scale, variance formula, or attribution in cases the evidence cannot identify. The low-level filter accepts weighted observation rows; duplicate source-record handling belongs at ingestion, and distinct observation sources remain distinct evidence.
