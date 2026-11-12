# External spot-check of anomalous warm-up records

The automated audit found four 1990–1993 driver/race entries where the local lap table extends past the `laps` value in local `results.csv`. This is an internal inconsistency, not proof that the lap entries are wrong. A limited spot-check against Formula 1's published race classifications found that all four classifications give the longer distance. Formula 1's data should be treated as an additional reference; this check does not establish the source or correctness of every individual lap time.

| Race and driver | Local result laps | Maximum local lap number | Formula 1 classification |
| --- | ---: | ---: | ---: |
| 1990 French GP, Thierry Boutsen | 7 | 8 | [8 laps](https://www.formula1.com/en/results/1990/races/70/france/race-result) |
| 1990 Italian GP, Riccardo Patrese | 52 | 53 | [53 laps](https://www.formula1.com/en/results/1990/races/75/italy/race-result) |
| 1992 South African GP, Jyrki Järvilehto | 44 | 46 | [46 laps](https://www.formula1.com/en/results/1992/races/2/south-africa/race-result) |
| 1992 French GP, Ukyo Katayama | 41 | 49 | [49 laps](https://www.formula1.com/en/results/1992/races/581/france/race-result) |

The 105% pace filter excludes the beyond-result laps in the two 1990 cases but retains five laps in the two 1992 cases. Deleting those five laps is therefore an intentionally adverse **sensitivity test**, not a correction: the additional external reference supports retaining them rather than clipping to the local result values. The local result discrepancies may also affect other logic that uses completed distance; this review did not audit every result or independently verify its reliability.

This repository credits [TracingInsights/RaceData](https://github.com/TracingInsights/RaceData), Jolpica-F1 and historical Ergast-derived sources; the original source for each individual record is not identified. See [the data notice](../../data/NOTICE.md).
