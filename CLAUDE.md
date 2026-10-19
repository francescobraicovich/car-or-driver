Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.
Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.
1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.
Before implementing:

* State your assumptions explicitly. If uncertain, ask.
* If multiple interpretations exist, present them - don't pick silently.
* If a simpler approach exists, say so. Push back when warranted.
* If something is unclear, stop. Name what's confusing. Ask.

2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

* No features beyond what was asked.
* No abstractions for single-use code.
* No "flexibility" or "configurability" that wasn't requested.
* No error handling for impossible scenarios.
* If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
3. Surgical Changes
Touch only what you must. Clean up only your own mess.
When editing existing code:

* Don't "improve" adjacent code, comments, or formatting.
* Don't refactor things that aren't broken.
* Match existing style, even if you'd do it differently.
* If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

* Remove imports/variables/functions that YOUR changes made unused.
* Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.
4. Goal-Driven Execution
Define success criteria. Loop until verified.
Transform tasks into verifiable goals:

* "Add validation" → "Write tests for invalid inputs, then make them pass"
* "Fix the bug" → "Write a test that reproduces it, then make it pass"
* "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
5. Naming
Every name you choose, for files, scripts, directories, functions, variables, classes, commits, branches, anything, must use precise professional vocabulary. Choose the word a 1972 IBM engineer would write in a specification. No slang, no casual shorthand, no cute or clever names, no words borrowed from chat culture. This applies universally, not only to the one example that follows: a script that deploys dashboards is ˋdeploy_dashboards.shˋ, not ˋpush_dashboards.shˋ. That is one illustration of the principle, not the extent of it.
These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# Project-specific instructions

In this repository, spell words out rather than abbreviating them (`state-space`, not `ss`; `head-to-head`, not `h2h`; `simulation`, not `sim`; `diagnostics`, not `diag`), and name a file for what it contains.

- `npm test` runs every test; `npm run lint` runs ESLint and Prettier; `npm run test:golden` checks the golden-master hashes; `npm run test:browser` drives the real site in headless Chrome.
- `packages/core` must never import from `site/` or touch browser globals (`tests/test-layering.mjs` enforces it).
- The layout of the repository is in `README.md`.
