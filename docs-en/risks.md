# Risks

Current technical and operational risks Docu-docu.

## RISK-01: Divergence with full Markdown

- Status: Open
- Probability: Medium
- Impact: Medium
- Owner: Docu-docu Team

Our own secure Markdown parser only supports documented
subset of syntax. The user may expect different Markdown behavior
engine.

### Risk Mitigation Plan

- [x] Fix supported constructs in README and reference book
  opportunities.
- [x] Cover rendering and escaping with behavioral tests.
- [ ] Add new syntax only along with positive and negative tests.

## RISK-02: Execute trusted task commands

- Status: Risk accepted
- Probability: Low
- Impact: High
- Owner: Repository user

The commands in the work item check section are executed through the system shell and
have the rights of the user who launched Docu-docu.

### Risk Mitigation Plan

- [x] Never execute commands with `check`, `build` or `task context`.
- [x] Require an explicit call to `task verify --run`.
- [x] Limit the time and volume of saved command output.

## RISK-03: Error when clearing output

- Status: Declining
- Probability: Low
- Impact: High
- Owner: Docu-docu Team

A faulty implementation of `--clean` can corrupt data outside the directory
generation.

### Risk Mitigation Plan

- [x] Disable root, documentation directory and its parent directories.
- [x] Check expanded paths and symbolic links.
- [x] Save negative tests for each fixed script.