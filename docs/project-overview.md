# Project overview

## The problem

A race result is produced by a driver and a car together, in particular conditions. Strong results may reflect exceptional driving, an exceptional car, or both. Looking only at finishing positions makes those contributions hard to separate.

That matters whenever drivers change teams, teams develop at different rates, or we compare careers across seasons. A rating that follows results alone will often mistake machinery for driver ability, or driver performance for machinery.

## Why independent ratings are difficult

We never observe a driver without a car, or a car without a driver. The data consists of pairings, not isolated performances.

Several things make the separation especially challenging:

- Drivers and cars are not assigned at random. The strongest drivers and teams often end up together.
- Performance changes over time: cars develop, drivers improve or decline, and teams make operational gains or losses.
- Results also reflect circuit characteristics, weather, strategy, reliability, safety cars, and incidents.
- Teammates give useful comparisons because they share a team context, but they are still not perfect controlled experiments.
- A driver moving to a new car is the most revealing test of portability—and one of the hardest predictions to make.

There is no way to remove all ambiguity from historical race data. A useful model should acknowledge that ambiguity rather than hide it behind a single confident ranking.

## Why this is interesting

Separating driver and car performance makes familiar Formula 1 questions more concrete:

- How much did a driver contribute beyond the machinery available to them?
- How should we interpret a strong season in a weak car, or a quiet season in a dominant one?
- What can a driver’s previous record tell us when they change teams?
- How much of the grid’s order survives from one season to the next?

It is also a useful modelling problem: the answer must be inferred from incomplete, changing, and highly confounded evidence. That makes uncertainty and out-of-sample testing as important as the rankings themselves.

## The approach

Car or Driver models driver and car pace jointly as hidden quantities that change over time. It uses race and qualifying comparisons, state-space filters, and an online pair-ranking learner to estimate dated driver and car levels.

The published ratings combine these estimates and present them on a scale centred on 1,000. A rating is an estimate, not a fact about a person or a machine; the displayed uncertainty reflects how much the model can infer from the available results.

This is a good attempt at the problem because it does not treat drivers or cars as fixed, isolated labels. It models both together, lets their estimates evolve, reports uncertainty, and evaluates forecasts using only information available before the weekend being predicted.

The most demanding evaluation is a driver joining a new car. The model improves on simpler approaches in that setting, but this remains an open problem rather than a solved one. See [known limitations](limitations.md) for the limitations and next questions.

Further detail is available in:

- [Hybrid model](hybrid.md)
- [State-space model](state-space.md)
- [Evaluation metrics](metrics.md)
- [Open problems](limitations.md)
