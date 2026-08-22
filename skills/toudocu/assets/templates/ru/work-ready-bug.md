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
## Симптом

{{SYMPTOM}}

<!-- toudocu:section expected-behavior -->
## Ожидаемое поведение

{{EXPECTED_BEHAVIOR}}

<!-- toudocu:section actual-behavior -->
## Фактическое поведение

{{ACTUAL_BEHAVIOR}}

<!-- toudocu:section steps-to-reproduce -->
## Шаги воспроизведения

{{REPRODUCTION_STEPS}}

## Окружение

{{ENVIRONMENT}}

<!-- toudocu:section evidence -->
## Доказательства

{{EVIDENCE}}

<!-- toudocu:section cause -->
## Причина

{{CAUSE}}

<!-- toudocu:section scope -->
## Область изменения

- `{{SCOPE_PATH}}`

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

- {{OUT_OF_SCOPE}}

<!-- toudocu:section plan -->
## План

1. {{PLAN_STEP}}

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [ ] `AC-01` {{ACCEPTANCE_CRITERION}}
- [ ] `AC-02` Регрессионный тест: {{REGRESSION_CRITERION}}

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `{{ACCEPTANCE_COMMAND}}`
- `AC-02` → `{{REGRESSION_COMMAND}}`
- `ALL` → `{{ALL_COMMAND}}`
- `DOCS` → `{{DOCS_COMMAND}}`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

{{DOCUMENTATION_IMPACT}}
