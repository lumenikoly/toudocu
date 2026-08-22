<!-- toudocu
id: {{TASK_ID}}
status: ready
taskType: {{TASK_TYPE}}
priority: {{PRIORITY}}
module: {{MODULE_ID}}
updated: {{DATE}}
{{OPTIONAL_FLOW_METADATA}}
{{OPTIONAL_SCREENS_METADATA}}
-->

# {{TASK_ID}}: {{TASK_TITLE}}

<!-- toudocu:section result -->
## Результат

{{RESULT}}

<!-- toudocu:section scope -->
## Область изменения

- `{{SCOPE_PATH}}`

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- {{OUT_OF_SCOPE}}

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [ ] `AC-01` {{ACCEPTANCE_CRITERION}}

<!-- toudocu:section plan -->
## План

1. {{PLAN_STEP}}

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `{{ACCEPTANCE_COMMAND}}`
- `ALL` → `{{ALL_COMMAND}}`
- `DOCS` → `{{DOCS_COMMAND}}`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

{{DOCUMENTATION_IMPACT}}

<!-- toudocu:section use-case-omission-reason -->
## Обоснование отсутствия сценария

{{USE_CASE_OMISSION_REASON}}
