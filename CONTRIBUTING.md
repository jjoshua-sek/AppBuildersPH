# Contributing

All changes reach `main` through a pull request. Nobody pushes to `main` directly.

## Branches
- Branch from the latest `main`: `git fetch origin && git switch -c <lane>/<short-name> origin/main`
- Name: `a/llama-bridge`, `b/ocr-android`, `c/crossword-grid`, `d/tutor-sheet`, `docs/...`, `fix/...`
- One feature per branch. Aim for PRs under ~400 changed lines (generated files and lockfiles excluded).
- **Stacked work:** if your branch needs another open PR, branch from that PR's branch and set it as your PR's base. After it merges, retarget your PR to `main`.

## Pull requests
1. Push your branch and open a PR into `main`. Fill in the template.
2. CI must pass: typecheck, lint, unit tests.
3. **One approval from someone in another lane.** Reviewers look at correctness, the shared contract (`src/types.ts`) and anything that could break the demo.
4. **Squash and merge**, then delete the branch.
5. Pull `main` into your other branches after a merge that touches files you use.

## Shared files
- `src/types.ts` is the contract between lanes. Change it only in its own small PR, after telling the whole team.
- `package.json` / native config (`android/`, `ios/`) belong to Lane A. Ask Lane A before adding a native dependency.
- New model, library or AI tool → update `DISCLOSURES.md` in the same PR.

## Commits
- Imperative subject under ~70 characters: "Add DevBench thread sweep", not "added stuff".
- Never commit model files (`*.gguf` is gitignored), keystores or secrets.

## Before you open a PR
```bash
npx tsc --noEmit && npm run lint && npm test
```
If the change touches native code or the model runtime, also run it on at least one real phone and say which in the PR.

## Milestone merges
At each milestone (M0, M1, M2, …), everyone merges what is ready, and someone runs the app on a phone from a fresh `main`. If `main` doesn't build, fixing it comes before anything else.

## Repository settings (owner, once)
- Settings → General → **Default branch: `main`**.
- Settings → Branches → add a rule for `main`: require a pull request, require 1 approval, require the **CI / check** status check, block force pushes.
- Settings → General → enable "Automatically delete head branches".
