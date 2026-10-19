# The learned filter: a network pretrained on simulated worlds, fine-tuned on the real results

> **Archived (neural-filter experiments).** Not part of the current model. The scripts named below were removed from the repository; they are at the tag `archive/pre-tidy-2026-10-14`. The current model and metrics: [../detach.md](../detach.md), [../metrics.md](../metrics.md).


A small recurrent network that does what the state-space filter does (carry a driver level, a new-team transient and a car level per entity, with their uncertainties, from weekend to weekend) but **learns how a surprise is shared between driver and car** instead of fixing it by variance settings. It is trained on tens of thousands of simulated worlds where the truth is known, then fine-tuned on the real results with the exam's forecast loss, then scored by the same harness as every other model (predictive table, the separation scorecard D2 of [state-space-hill-climbing-2.md](state-space-hill-climbing-2.md), the no-freezing guards).

**Update (detach phase, 2026-10-13):** none of this entered the shipped ratings. The separation problem was solved with three parameters instead: the race filter reads the qualifying filter ([detach.md](../detach.md)). All local work files now live in `nn-work/` in the repository (git-ignored).

**Status: the code, the simulators and a fast local training pipeline are written, and the experiment has now been run to the end once (see Results below); the verdict, after a correction (see the first paragraph of Results), is that the networks do not beat the Kalman filter out of sample.** The first pretraining was stopped by hand at step 580 of 1,200 (race) and 600 of 1,000 (qualifying) to make it fast enough to rerun locally; those checkpoints were in a throwaway sandbox and are gone. Nothing here changes the shipped ratings (all of it is research code under `packages/research/`, plus this document).

## Handover: how to pick this up

**Do this first, in this order.** (1) `requirements-nn.txt` into a venv, `npm ci`. (2) `nn-local.sh WORK data` (a few minutes with one node process per core). (3) `nn-bench.py --calendar WORK/calendar.json` and read the fastest `--devices`. (4) `python packages/research/python/test_nnfilter.py WORK/calendar.json` (four checks; it should print four lines and no assertion). (5) `nn-local.sh WORK pretrain`, then `nn-local.sh WORK pipeline`. (6) Read `WORK/out-race/` and `WORK/out-qual/`: `zero.txt`, `A-pre.txt`, `A-scratch.txt`, `B-pre.txt`, `B-scratch.txt` (the harness scorecard of each network on the real results), `gridA.json`, `chosen-*.json`, and `sim-{v1c,v2}-*.txt` (truth recovery against the Kalman filter on unseen worlds). (7) Write the results into a new section of this file, in the shape of the tables of [state-space-hill-climbing-2.md](state-space-hill-climbing-2.md): predictive loss by window, session and pair type, D2 and its terms next to the floors, the guards, the weak slices, what the ablation (no pretraining) says.

**What has been run, and what has not** (so you know what to trust):

| Piece | State |
| --- | --- |
| `test_nnfilter.py` (forward-only, deterministic, identity-blind, data-parallel loss) | passes (last run after the compact rewrite) |
| the compact filter against the original one | identical to float32 rounding on every output (largest relative difference 4.5e-7 race, 3.1e-7 qualifying; weights perturbed, random worlds). A one-off script, not committed; the original is `nnfilter.py` at commit `95f5d5f` if you want to redo it. Old checkpoints load into the new code (same parameters). |
| pretraining on the real banks | ran: 580 / 600 steps of the first version (race / qualifying), and 30 to 60 steps of the compact version on 4 cores (0.76 s a step including world generation) |
| fine-tuning (`finetune`) from a checkpoint and from scratch, `export`, `nn-eval.mjs` on the real results | ran, at a few steps, on an early checkpoint |
| `nn-local.sh`, tiny sizes (8 worlds, 4 pretraining steps, 5 fine-tuning steps): data, pretraining of both sessions, stage A and stage B of **race** | ran to the end of stage B for race |
| stage `sim` of `nn-pipeline.py` (the networks on unseen v1c / v2 worlds, scored against the Kalman filter) | **never completed**: `nn-train.py export --worlds` and `nn-eval.mjs --sim ... --nn-worlds` with a network were not run together once (the Kalman-only path of `--sim` was run and gives the reference table below). Expect to debug this one. |
| the pipeline for **qualifying** (stages A, B, sim) | not reached |
| anything on a Mac (MPS or CPU), `nn-local.sh` under macOS bash 3.2, `xargs -P` | untested: no Mac was available |
| `jax.shard_map(..., check_vma=False)` | the API of the pinned `jax==0.11.2`; an older JAX needs `jax.experimental.shard_map` and `check_rep` |

**Rules that carried over from the hill climbs** (same data discipline): never `--holdout`; select on 2008–2011 only; 2012–2015 is read once at the end and is not an untouched window; do not edit `exam.js`, `observations.js` or the metric code in `packages/eval`; state what you could not verify.

**Reference numbers to compare with** (the baseline Kalman filter; the shipped ratings; `research/eval/baseline.json`, `docs/history/state-space-hill-climbing-2.md`):

| Real results, ratings alone, combined all pairs | 2002–2007 | 2008–2011 | 2012–2015 | P (2002–2011) | D2 (2002–2011 / 2002–2015) |
| --- | --- | --- | --- | --- | --- |
| baseline Kalman filter | 0.3862 | 0.3877 | 0.3656 | 0.38693 | 0.543 / 0.633 |

| Unseen simulated worlds (baseline Kalman filter, mean of 4, through 2015) | loss 2002–11 | rmse driver | rmse car | D_session | T1 | T2 | T3 | T4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| calibrated v1, race | 0.390 | 17.1 | 21.4 | 0.355 | 0.729 | 0.363 | 0.136 | 0.191 |
| calibrated v1, qualifying | 0.412 | 16.4 | 21.1 | 0.437 | 1.105 | 0.241 | 0.134 | 0.267 |
| Simulator v2, race | 0.391 | 21.3 | 32.7 | 0.611 | 0.815 | 0.528 | 0.369 | 0.730 |
| Simulator v2, qualifying | 0.376 | 21.5 | 44.4 | 0.414 | 1.154 | 0.273 | 0.065 | 0.164 |

(`nn-eval.mjs --calendar WORK/calendar.json --sim v1c|v2 --session race|qual --last 2015` regenerates these from the worlds' seeds 1 to 4; with `--nn-worlds SESSION=run.json` it adds the network's row.)

**Things worth deciding or checking** once it runs: whether two Laplace iterations (`ITERS=2`) beat one at equal loss (one is 1.5× faster); whether pretraining on Simulator v2 only, on the Python worlds only, or on the mix (`--mix-v2`) transfers best to the real results; whether the zero-shot network's very small mover swing but absent frozen transfer (seen at step 100) persists once trained longer; the error-bar calibration of the network's own standard deviations on the real results (`z2` and `cover90` are in the scorecard); and the leak of the network against the true car swing on the unseen worlds (`leakTruth`).

## What is in the repository

| File | What it does |
| --- | --- |
| `packages/research/python/nnfilter.py` | the network (a `jax.lax.scan` over the weekends of a batch of worlds), the generator of simulated worlds, the losses, the data-parallel `Sharder` |
| `packages/research/python/nn-train.py` | `pretrain`, `finetune` and `export` commands |
| `packages/research/python/nn-pipeline.py` | zero-shot, the fine-tuning grid (stage A: fit 2002–2007, choose the step on 2008–2011), the same grid without pretraining, stage B (refit through 2011, score 2012–2015 once), the networks on unseen simulated worlds |
| `packages/research/python/nn-local.sh` | everything above in one command |
| `packages/research/python/nn-bench.py` | seconds per training step on this machine for different numbers of cores |
| `packages/research/python/test_nnfilter.py` | what must hold whatever the weights: forward-only, deterministic, blind to who is who, data-parallel loss equals the plain loss |
| `packages/research/node/nn-export.mjs`, `nn-worlds.mjs`, `nn-dynamics.mjs` | the real calendar and outcomes; banks of simulated worlds from the harness (v1 calibrated, Simulator v2) |
| `packages/research/node/nn-eval.mjs`, `scorecard.mjs` | the network's run through the harness (loss by window, D2, guards; truth recovery on simulated worlds against the Kalman filter) |

It is a **forward filter** (the state after a weekend uses that weekend and earlier ones: tested by changing every later outcome) and it has **no driver or car identity as input** (only tenure, flags, uncertainties and the likelihood evidence: tested by relabelling the drivers), so fine-tuning on one sequence of real results cannot memorise who is who.

## Training it on a MacBook

```bash
# once
python3 -m venv .venv-nn && .venv-nn/bin/pip install -r requirements-nn.txt     # jax and optax: native arm64 CPU wheels
npm ci                                                                           # the harness and the simulators

# is it fast here? seconds per step for 1, 2, 4, 8 cores
.venv-nn/bin/python packages/research/python/nn-bench.py --calendar WORK/calendar.json   # after the data stage below, or any calendar.json

# everything: data, pretraining of race and qualifying, fine-tuning grid, ablation, scoring
PY=.venv-nn/bin/python packages/research/python/nn-local.sh WORK all
# or by stage:   nn-local.sh WORK data | pretrain | pipeline
```

Settings, all optional environment variables: `JOBS` (cores to use, default all), `STEPS` (pretraining steps, default 1,200 race / 1,000 qualifying), `BATCH` (worlds per step, 32; raised to a multiple of the cores), `ITERS` (Laplace iterations per weekend, 2; 1 is about 1.5× faster), `N_RACE` / `N_QUAL` (Simulator v2 worlds to generate, 1,200 each), `FT_STEPS` (fine-tuning steps, 200). Everything is written under `WORK`, nothing to the repository; the banks are about 1.2 MB a world (2,400 worlds: about 3 GB of disk) and are memory-mapped.

### Why the CPU and not the GPU (MPS)

The network is a chain of 212 weekends, each a few hundred small operations (a dozen tensors of at most 32 × 552 × 24 numbers). That is the opposite of what a GPU is good at: every operation is a separate launch, a step is a few hundred thousand of them (my estimate, not measured: there is no Mac here), and a launch costs tens of microseconds, more than the arithmetic it starts; the JAX Metal plugin is also unmaintained and does not follow current JAX. A PyTorch/MPS port would have the same problem. The M-series cores are fast at exactly this kind of work, so the code uses all of them: **the worlds of a batch are independent, so the batch is split over the cores** (`jax.shard_map` over CPU devices; each core runs the whole scan on its share and the gradient is averaged). I could not test on a Mac; the measurements below are from a 4-core Linux machine.

### What made it fast (a step of 32 worlds, both Laplace iterations, race, 2000–2011)

| | seconds per step |
| --- | --- |
| first version (all 98 drivers and 27 cars in every operation) | 3.84 |
| only the weekend's own drivers and cars (about 22 and 11), gathered at the start and scattered back at the end | 1.89 |
| the batch split over 2 cores / 4 cores | 1.03 / **0.57** |
| the same with one Laplace iteration (`ITERS=1`) | 1.15 / 0.65 / **0.37** on 1 / 2 / 4 cores |

The compact version computes the same numbers (largest difference 4.5e-7 relative, float32 rounding, on every output with perturbed weights; the parameters have the same shape, so checkpoints of the first version still load). Scaling over cores is close to linear (3.3× on 4), so **an 8-core machine should reach about 0.3 s a step: a 1,200-step pretraining takes under ten minutes, where it took about two hours a session on the first version under load.** Other changes: the next batch of simulated worlds is drawn in a background thread while a step runs; the compiled filter is cached on disk (`nn-work/jax-cache`, or `NN_JAX_CACHE`), so restarts and the fine-tuning grid do not recompile; the 14 fine-tunings of the grid, each too small to use more than a core, run as concurrent processes (`--jobs`; four at once took about as long as one); keeping all activations instead of recomputing them (`--no-remat`) and unrolling the scan were both slower or no faster. On a Mac with performance and efficiency cores, run `nn-bench.py` and choose the `--devices` of the fastest row (`JOBS=6` for `nn-local.sh`, say).

## Evidence so far

None of this is a verdict on the method.

- **The harness's own v1 worlds are far too narrow.** Drawn from the filter's settings, a race world has a car spread of about 20 points; the filter reads 53 on the real results, and 0.77 loss against 0.39. The generator here is centred on dynamics chosen so that the baseline Kalman filter reads on it what it reads on the real data (`nn-dynamics.mjs`).
- **Simulator v2 reproduces the real structural deficit.** The baseline Kalman filter on v2 race worlds reads D2 of 0.61 and a frozen-transfer term of 0.73; the real data reads 0.62 and 0.74 (calibrated v1: 0.36 and 0.19). So part of what the second climb called a filter deficit looks like the world (a driver–car fit and true changes at a move), which a filter trained with the truth can in principle separate and a hand-set one cannot.
- **Pretraining works on simulated worlds.** After 580 steps the race network's error against the truth on held-out v2 worlds was 12.3 points for drivers and 22 for cars (the Kalman filter, on a different set of v2 worlds through 2015: 21 and 33; to be redone on identical worlds), and still improving.
- **An early checkpoint (step 100) on the real results:** P 0.4065 against 0.3869 for the Kalman filter, a mover swing that was too small and a frozen transfer that was nil. Fine-tuning moves the first of these fast (8 steps of 0.5 s took the 2008–2011 loss from 0.414 to 0.397).

## Results of the first complete local run (10-core Mac, 2026-10-07)

**Correction (same day).** The first version of this section reported "a small race gain in predictive loss". That was an in-sample number: stage B is refit through 2011, so its P (2002–2011) and the 2008–2015 pool contain years it was trained on, and stage A's 2008–2011 is the window the step and the grid were selected on. **The only honest out-of-sample windows are 2008–2011 for stage A (selected on, so optimistic) and 2012–2015 for stage B (read once).** On 2012–2015, combined all pairs, the baseline Kalman filter is 0.3656 and: race network B-pretrained 0.3802, B-scratch 0.3835; qualifying network B-pretrained 0.3664, B-scratch 0.3678. **Every network is worse than the Kalman filter out of sample** (race by 0.015). On 2008–2011 (stage A, selected) the baseline is 0.3877 and A-pretrained race is 0.3853, qualifying 0.3876: no gain beyond what selection buys. Read the predictive tables below with that in mind; the sentences that say "a small gain" are superseded by this paragraph. The fine-tuning logs show the mechanism: on the race grid's first row, train loss falls 0.416 to 0.348 over 200 steps while the 2008–2011 validation loss goes 0.393 (step 50), 0.459, 0.476, 0.504: the network memorises the real training years (see the review below).

Run exactly as in the handover: 1,200 / 1,000 pretraining steps of 32 worlds on 8 cores (about 6 minutes a session, 0.36 s a step), then `nn-local.sh WORK pipeline` (grid of 7 fine-tunings from the pretrained and from scratch, stage A on 2002–2011 and stage B refit through 2015, scoring through the harness). The `sim` stage, which had never completed, ran to the end for both sessions without changes. One fix was needed for macOS: the `data` stage's `xargs -I` failed silently (BSD `xargs` refuses long replacements, and `|| true` hid it), so no simulated worlds were generated; the jobs now run as one script each. Everything is in `nn-work/` in the repository root (git-ignored). One run, one seed, selection on 2008–2011 only.

**Predictive loss on the real results (ratings alone, combined all pairs).** The baseline Kalman filter is P 0.38693, 2008–2011 0.3877, 2012–2015 0.3656 (above). Race and qualifying networks are scored together; the qualifying network's table is the one that carries both.

| Model | P (2002–2011) | pooled 2008–2015 | 2002–2015 |
| --- | --- | --- | --- |
| baseline Kalman filter | 0.38693 | | |
| zero-shot (race net, then qual net) | 0.41244 / 0.38783 | 0.4147 / 0.3884 | |
| stage A, pretrained (fit on 2002–2011 only) | 0.38482 (race) / 0.38671 (qual) | 0.3853 / 0.3876 | |
| stage B, pretrained | 0.38235 (race) / 0.38655 (qual) | 0.3775 / 0.3764 | 0.3816 / 0.3794 |
| stage B, not pretrained | 0.39081 (race) / 0.38679 (qual) | 0.3848 / 0.3773 | 0.3882 / 0.3801 |

- **Race: a small real gain, and pretraining is what produces it.** The pretrained, fine-tuned race network is 0.0046 below the Kalman filter on P (1.2%); the same network from scratch is 0.0039 above it. Zero-shot it is clearly worse (0.412): the simulated worlds alone do not give the real calibration.
- **Qualifying: nothing.** 0.38655 against 0.38693, and pretraining versus scratch is within noise (0.38655, 0.38679). Differences of this size are inside the error bars of the climb documents.

**Separation (D2, lower is better, floor about 0.31 race / 0.46 qualifying on 2002–2011).** Baseline 0.543 (2002–2011), 0.633 (2002–2015).

| | D2 | race | qual |
| --- | --- | --- | --- |
| zero-shot | 0.477 / 0.519 | 0.489 / 0.621 | 0.465 / 0.418 |
| stage A pretrained | 0.427 / 0.568 | 0.388 / 0.621 | 0.465 / 0.516 |
| stage B pretrained (through 2015) | 0.545 / 0.693 | 0.604 / 0.780 | 0.486 / 0.605 |
| stage B scratch | 0.498 / 0.608 | 0.511 / 0.780 | 0.486 / 0.436 |

(Each cell with two numbers is race network / qualifying network; the other session's columns repeat the baseline of the first.) On 2002–2011 the race network reaches D2 race 0.388 at stage A, below the climbs' best (race 0.55 at no cost in loss), but the stage B refit through 2015 gives it back (0.604), and the qualifying network is worse than the baseline on D2 in every row where it was pretrained. **D2 does not improve robustly.** Guard flags, from the tables: the pretrained race network's cars' efficiency is -0.096 (reacts too fast) at stage B, and the fine-tuned qualifying networks' efficiency of drivers is 0.07 to 0.14 (slow; the guard allows +0.03). By the rule of the climbs the networks would not be accepted on separation, and the loss gain is small.

**Truth recovery on unseen simulated worlds (mean of 4, through 2015; Kalman filter on the same worlds).**

| rmse driver / car | Kalman | zero-shot | stage B pretrained | stage B scratch |
| --- | --- | --- | --- | --- |
| v1c race | 17.1 / 21.4 | 16.8 / 22.4 | 22.1 / 27.5 | 23.2 / 27.8 |
| v2 race | 21.2 / 32.9 | **11.1 / 14.9** | 20.7 / 29.9 | 21.6 / 35.6 |
| v1c qualifying | 16.4 / 21.1 | 17.8 / 22.4 | 19.4 / 24.5 | 21.4 / 25.2 |
| v2 qualifying | 21.5 / 44.4 | 22.1 / 30.6 | 24.9 / 47.4 | 28.1 / 44.5 |

- **The pretrained network knows the world it was trained on.** Zero-shot on v2 race it halves the Kalman filter's error against the truth (11.1 / 14.9 against 21.2 / 32.9) and separates mover swing and car and driver much better (D 0.44 against 0.55). But its forecast loss there is worse (0.416 against 0.394): the truth-recovering model is not the best forecaster.
- **Fine-tuning on the real results destroys that.** After stage B the network's error on the same unseen worlds is back to the Kalman filter's or worse, and in the scratch network it is worse than the Kalman filter on every world (z2 of the driver up to 41 on v1c race: badly overconfident). The forecast loss is the only thing the real data supervises, and the network buys it by trading away the structure.

**Reading it.** The method works as designed on simulated truth (zero-shot v2 race), and the fine-tuned race network is a small predictive gain over the Kalman filter that needs the pretraining. It is not a better separation of driver and car on the real data by the scorecard that the climbs fixed, qualifying shows no gain, and the one thing the network knows best is what the fine-tuning removes. **Next steps that this run suggests** (not tried): fine-tune with a loss that also keeps the network's driver–car structure (for instance a term on truth in mixed simulated and real batches, or a much stronger anchor than `l2sp` 0.1 on the structural heads); repeat with other seeds to see whether the 0.0046 race gain is outside noise; try the zero-shot network's calibration only (a temperature on its forecasts) rather than every weight.

## Review of the architecture, the inputs and the loss (2026-10-07, after the first run)

**Architecture.** It is not a two-layer MLP, but the objection is right in substance. The filter keeps an analytic time update and a diagonal Newton step and adds two small MLPs (driver: 46 inputs, two hidden layers of 64, 21 outputs; car: 16 inputs, 64, 12 outputs; about 14,500 parameters in all), applied to each driver and each car **independently**, twice per weekend, with an 8-number gated memory per entity. What it cannot do: (1) see the field (a driver is judged from his own evidence, the mean of his teammates' and his car's; nothing says who the opposition was or how strong the weekend's other cars are); (2) use more than 8 numbers of history; (3) use the size of a result, since only the sign of each pair enters (the margin in seconds, the gap in the race, are thrown away); (4) share information between entities except through one hop. It is a good filter skeleton with a very small learned part; the learned part is where the Kalman filter's deficit lies (who owns a surprise).

**What lets it memorise.** (a) Fine-tuning on the real results is one trajectory of 212 weekends, 2002–2007 in the gradient. (b) The driver features contain `r_app` (appearances so far, /50) and `r_since` (weekends since the last move), the wet flag and the winter flag. In 2002–2011, 72% of the (appearances, since, wet) combinations point to a single driver-weekend, and in 37% of the driver-weekends the appearance count alone is unique in the field: a fingerprint of who and when. With a fingerprint, the network can learn "this driver-weekend: push up by x" and fit the training years exactly; that is what the log above shows. (c) The 8-number memories can store a driver's identity. (d) Pretraining always uses the same real calendar, 212 weekends through 2011: the stage-B evaluation through 2015 runs 77 weekends the network never saw in any world, with `r_app` and `r_since` beyond their training range. (e) Selection: seven learning-rate and anchor settings, plus the stopping step, are chosen on 2008–2011, which is then reported.

**What it is given** (per driver and iteration): the pair evidence (gradient and curvature of the Bradley–Terry likelihood, own team and others), the log prior spreads, the three pulls from the prior, the teammates' same quantities, the gap to the teammate, car aggregates, wet, winter, appearances, rookie, mover, new, since, iteration flags, the two memories. **What it is not given and the data hold** (`data/*.csv`): the **size of each result** (qualifying Q1/Q2/Q3 times in seconds; finishing time gaps in milliseconds; fastest-lap times and speeds; laps completed; lap-by-lap times, of which only the pace summary enters), the **circuit** (id, latitude, altitude: a car's strength is not the same on every track, and which circuits favour which kind of car is learnable across worlds), **driver age** (date of birth: age curves are the most reliable structure in driver strength), **how a race ended** (`status`: a mechanical failure is a car outcome, a collision is a driver outcome; the filter now treats a retirement like a result), the **grid slot** against the qualifying result, the **date** (days between weekends, the position in the season), the era (regulation changes), the engine supplier (not in the files; derivable from the constructor lineage), sprint formats. Most of these are not usable in the form of a feature of a single weekend; the useful ones are the margins, the circuit, the age and the retirement cause.

**What it is given that it should not be**: the raw appearance count and the raw since-counter (replace by buckets: rookie, 1–2 seasons, veteran; recently moved or not) and, more generally, anything that is a counter that only goes up; the per-weekend wet flag without noise is a calendar fingerprint (keep it, but let the simulator randomise which weekends are wet); the fixed real calendar itself. The structural fix is to **randomise the calendar in the simulated worlds** (who races for whom, when drivers move, how the lineups are paired), so that no input identifies a driver or a weekend, and the real weekends are one more draw.

**The loss.** Pretraining: the exam's weighted forecast log-loss of each pair from the prior state, plus the mean square error of the posterior levels against the truth divided by 400, plus 0.1 times the Gaussian negative log-likelihood of the truth under the posterior. Fine-tuning: the forecast loss alone on 2002–2007 plus an anchor to the pretrained weights. Weaknesses: (1) the truth terms vanish when fine-tuning (the rehearsal term exists but is off in the pipeline), and truth recovery then goes back to the Kalman filter's level or worse (the table above); (2) the forecast loss is one step ahead, so it does not force a rating to be right about a car after a long time or a move (the thing D2 asks); (3) a binary outcome is a weak signal: a season has a few thousand pairs, mostly redundant; (4) the weights of the exam (a pair's weight can be 9) make a handful of pairs decide the gradient; (5) the MSE weight is arbitrary.

**What to change, in the order I would do it** (none done yet except the batch default):
1. **Fix the evaluation first** (done in this document): report only out-of-sample windows; choose the step and the grid on a validation block that is rotated (2005–2007 and 2008–2011 by turns) and read 2012–2015 once.
2. **Stop the fingerprints**: buckets for `r_app` and `r_since`; randomise calendars and lineups in the simulated worlds (movers, teammate pairs, which weekends are wet), train on weekends beyond 2011 (T through 2015, so there is no unseen tail), with noise on the flags.
3. **Fine-tune with the truth in the loop**: keep rehearsal on simulated worlds (a fixed share of every gradient), or fine-tune only a few scalars (a temperature, the likelihood weights, the process scalars) and freeze the MLPs: the grid already includes "MLPs frozen"; it was not the best (race 0.3999) but it is the one that cannot memorise, and the first-step values show the zero-shot calibration alone is off by 0.04 (0.433 against 0.390).
4. **Give it more to read and a way to compare entities**: an attention layer over the weekend's drivers (every driver sees the whole field), a larger memory (32 to 64 numbers) with a proper recurrent update, and the new inputs above (margins as a second observation channel, circuit embedding learned across worlds, age, retirement cause). The simulator must then generate these (a margin is the performance difference plus noise; circuit effects as a driver-by-car-by-track term; retirement causes) so that pretraining can learn to use them.
5. **A loss that asks for what we want**: add a k-weekends-ahead forecast of the same pair outcomes (k = 1, 5, 10, and across winter), the truth terms with weights that are not arbitrary (the NLL of the truth is proper; the MSE can go), and a penalty on the swing of a ratings that the control group does not share (the D2 control) once the first three are in.
6. **Batch size**: raised to 128 worlds a step (about 1.4 s a step on 8 cores; 1,200 steps in about 30 minutes). It reduces the noise of the pretraining gradient, which is the part that works; it does nothing for the part that fails (fine-tuning on one real trajectory), so do not expect it to change the verdict by itself.

## What the experiment will report

Zero-shot (nothing fitted to the real results), fine-tuned from the pretrained network, and fine-tuned from a network that was not pretrained (does the simulated data help?), each scored on the predictive table by window, session and pair type, on D2 and its terms against the floors of the two kinds of simulated worlds, and on the guards; plus truth recovery against the Kalman filter on identical unseen worlds. Selection uses 2008–2011 only; 2012–2015 is read once, at the end, and is not an untouched window (see [state-space-hill-climbing-2.md](state-space-hill-climbing-2.md)).

## Sequence model (seqfilter.py), first race run (2026-10-08, stopped at step 500 of 1,000)

A recurrent model with almost no hand-built structure (`seqfilter.py`, `seq-train.py`, `sepmetrics.py`): a GRU state per driver and per car, each read out as ONE number, pairs forecast from (driver + car) differences, raw pairs as messages, no counters or identities; loss = forecast + truth + a match of the scorecard terms (differentiable port in `sepmetrics.py`, equal to the harness on T1 to T3) to the same terms computed from the true levels. Pretrained only on simulated worlds, batch 128, 500 steps (about 42 minutes); **never fitted to a real result, so every real window below is out of sample.**

| Race network, zero-shot, scored through the harness | 2008–2011 | 2012–2015 | D2 race (through 2015) |
| --- | --- | --- | --- |
| baseline Kalman filter, all pairs | 0.3877 | 0.3656 | about 0.63 (both sessions) |
| old network, fine-tuned (stage B) | in-sample | 0.3802 | 0.604 |
| sequence model, step 500 | 0.4001 | 0.3686 | **0.462** (T1 0.837, T2 0.212, T3 0.102, T4 0.696) |

On held-out Simulator v2 worlds it reaches forecast loss 0.371 and error against the truth 13.6 / 13.3 (drivers / cars), against 0.394 and 21 / 33 for the Kalman filter. Not yet done: the qualifying session, fine-tuning, randomised calendars, margins and circuit inputs. The guard "efficiency of drivers" read -0.225 at step 300 (over-reacts): not yet checked at step 500. Checkpoint and exports are in `nn-work/seq` (git-ignored).
