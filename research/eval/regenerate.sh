#!/bin/bash
# Regenerates every output reported in docs/ for the shipped model, from the data in data/. About 20 minutes. Run from the repository root with Node 24.
#   bash research/eval/regenerate.sh
# 2016+ appears only in the files marked "second look": that window was read for an earlier version of the model and is not independent (research/eval/ACCEPTANCE-detach.md).
set -e
N=research/eval
node packages/research/node/evaluate.mjs --model state-space --full --null 4 --boot 300 --label shipped --json $N/shipped-harness.json > $N/shipped-harness.txt 2>/dev/null
node packages/research/node/evaluate.mjs --model state-space --holdout --null 0 --boot 300 --label shipped-holdout > $N/shipped-harness-2016.txt 2>/dev/null
node packages/research/node/evaluate.mjs --model state-space --holdout --null 0 --boot 300 --label baseline-holdout --no-link \
  --set race.tau=0.05 --set race.winterC=11.379153390987709 --set race.sdNew=20 --set race.sdA=5 --set race.rhoA=0.8 --set race.varInfl=7.88 --set race.rateA=1 > $N/baseline-harness-2016.txt 2>/dev/null
node packages/research/node/suite.mjs --configs base,final --json $N/suite.json > $N/suite.txt
node packages/research/node/suite.mjs --configs base,final,final+adapt --holdout > $N/suite-second-look.txt
node packages/research/node/strict-eval.mjs --last 9999 --configs base,final > $N/strict-eval.txt
node packages/research/node/strict-paired.mjs --holdout > $N/strict-paired.txt
node packages/research/node/ablate.mjs > $N/ablation-strict.txt
node packages/research/node/simulation-optimum.mjs --json $N/simulation-optimum.json > $N/simulation-optimum.txt
node packages/research/node/heads-metrics.mjs --json $N/heads-metrics.json > $N/heads-metrics.txt
node packages/research/node/loading.mjs > $N/detach-loading.txt
node packages/research/node/diagnose.mjs --K 10 > $N/diagnosis-real.txt
node packages/research/node/diagnose.mjs --K 10 --model base > $N/diagnosis-real-baseline.txt
node packages/research/node/diagnose-era.mjs > $N/diagnosis-era.txt
node packages/research/node/diagnose-simulation.mjs > $N/diagnosis-simulation.txt
node tools/make-metrics-snapshot.mjs
echo done
