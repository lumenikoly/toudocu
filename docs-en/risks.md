# Risks

Current technical and operational risks for Toudocu.

## RISK-01: Changes to the Markdown dialect or engine

- Status: Mitigating
- Probability: Low
- Impact: Medium
- Owner: Toudocu Team

Goldmark provides a single CommonMark/GFM AST, but an update to the version or
extension set can change normalization, source ranges, and canonical HTML.

### Risk mitigation plan

- [x] Record the supported constructs in README and the feature reference.
- [x] Cover rendering and escaping with behavioral tests.
- [x] Convert current documents into the Goldmark cutover regression corpus.
- [ ] Update the dialect or engine only together with corpus, security, and semantic review.

## RISK-02: Execution of trusted task commands

- Status: Risk accepted
- Probability: Low
- Impact: High
- Owner: Repository user

Commands in the work-item verification section are executed through the system
shell and have the permissions of the user who launched Toudocu.

### Risk mitigation plan

- [x] Never execute commands during `check`, `build`, or `task context`.
- [x] Require an explicit `task verify --run` invocation.
- [x] Limit command duration and the amount of retained output.

## RISK-03: Error while cleaning output

- Status: Mitigating
- Probability: Low
- Impact: High
- Owner: Toudocu Team

An incorrect `--clean` implementation could damage data outside the generation
directory.

### Risk mitigation plan

- [x] Reject the root, documentation directory, and its parent directories.
- [x] Check resolved paths and symbolic links.
- [x] Retain negative tests for every corrected scenario.
