<!-- toudocu
id: {{USE_CASE_ID}}
status: {{STATUS}}
priority: {{PRIORITY}}
module: {{MODULE_ID}}
startScreen: {{START_SCREEN_ID}}
terminalScreens: {{TERMINAL_SCREEN_IDS}}
updated: {{DATE}}
{{OPTIONAL_ALLOW_CYCLE_METADATA}}
{{OPTIONAL_SCREENS_METADATA}}
-->

# {{USE_CASE_ID}}: {{USE_CASE_TITLE}}

Актор: {{ACTOR}}.

{{USE_CASE_SUMMARY}}

## Входные данные

- {{INPUT}}

<!-- toudocu:section prerequisites -->
## Предусловия

- {{PRECONDITION}}

<!-- toudocu:section main-scenario -->
## Основной сценарий

1. {{MAIN_STEP}}

## Ошибочные сценарии

{{ERROR_SCENARIOS}}

<!-- toudocu:section postconditions -->
## Постусловия

{{POSTCONDITIONS}}

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [ ] {{ACCEPTANCE_CRITERION}}

<!-- toudocu:section business-rules -->
## Бизнес-правила

- {{BUSINESS_RULE_ID}} — {{BUSINESS_RULE_REFERENCE}}

<!-- toudocu:section implementation -->
## Реализация

- [{{MODULE_TITLE}}](../modules/{{MODULE_FILE}})
