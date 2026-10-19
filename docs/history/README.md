# History: experiments that did not ship

These write-ups record work that is finished and not part of the current model. They are kept because the results (including the negative ones) are what the current model was built on. **The scripts that produced them were removed from the repository**; the last commit that has them is the tag `archive/pre-tidy-2026-10-14` (`git checkout archive/pre-tidy-2026-10-14 -- <path>`), and their pre-registered rules and candidate logs are kept in [`research/eval/history`](../../research/eval/history).

| Document | What it was | Outcome |
| --- | --- | --- |
| [state-space-hill-climbing-1.md](state-space-hill-climbing-1.md) | A hill climb of the filter's settings against a structural deficit D (leak, frozen slope, error bars, mover step) | One useful result (the reporting scale for the error bars, `varInfl`); the settings it found gained in 2002–2011 and lost in 2012–2015 and were not shipped |
| [state-space-hill-climbing-2.md](state-space-hill-climbing-2.md) | The same with a scorecard measured against a control group (D2) | The scorecard and its floor survive (`separation*.mjs`); the settings were not shipped |
| [neural-filter.md](neural-filter.md) | A recurrent network, then a GRU sequence model, pretrained on simulated worlds and fine-tuned on the real results, to learn how a surprise is shared between driver and car | Did not beat the Kalman filter out of sample; fine-tuning on the real results memorised the training years |

What replaced them is described in [../detach.md](../detach.md), with the diagnosis in [../diagnosis.md](../diagnosis.md) and every metric in [../metrics.md](../metrics.md).
