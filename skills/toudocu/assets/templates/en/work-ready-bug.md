<!-- toudocu
id: {{BUG_ID}}
status: ready
taskType: bug
severity: {{SEVERITY}}
priority: {{PRIORITY}}
reproducibility: {{REPRODUCIBILITY}}
regression: {{REGRESSION}}
module: {{MODULE_ID}}
useCase: {{USE_CASE_ID}}
updated: {{DATE}}
{{OPTIONAL_SCREENS_METADATA}}
{{OPTIONAL_TRANSITIONS_METADATA}}
-->

# {{BUG_ID}}: {{BUG_TITLE}}

<!-- toudocu:section symptom -->
## Symptom

{{SYMPTOM}}

<!-- toudocu:section expected-behavior -->
## Expected behavior

{{EXPECTED_BEHAVIOR}}

<!-- toudocu:section actual-behavior -->
## Actual behavior

{{ACTUAL_BEHAVIOR}}

<!-- toudocu:section steps-to-reproduce -->
## Steps to reproduce

{{REPRODUCTION_STEPS}}

## Environment

{{ENVIRONMENT}}

<!-- toudocu:section evidence -->
## Evidence

{{EVIDENCE}}

<!-- toudocu:section cause -->
## Cause

{{CAUSE}}

<!-- toudocu:section scope -->
## Scope

- `{{SCOPE_PATH}}`

<!-- toudocu:section out-of-scope -->
## Out of scope

- {{OUT_OF_SCOPE}}

<!-- toudocu:section plan -->
## Plan

1. {{PLAN_STEP}}

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [ ] `AC-01` {{ACCEPTANCE_CRITERION}}
- [ ] `AC-02` Regression test: {{REGRESSION_CRITERION}}

<!-- toudocu:section verification -->
## Verification

- `AC-01` -> `{{ACCEPTANCE_COMMAND}}`
- `AC-02` -> `{{REGRESSION_COMMAND}}`
- `ALL` -> `{{ALL_COMMAND}}`
- `DOCS` -> `{{DOCS_COMMAND}}`

<!-- toudocu:section documentation-impact -->
## Documentation impact

{{DOCUMENTATION_IMPACT}}
