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

Actor: {{ACTOR}}.

{{USE_CASE_SUMMARY}}

## Inputs

- {{INPUT}}

## Preconditions

- {{PRECONDITION}}

<!-- toudocu:section main-scenario -->
## Main scenario

1. {{MAIN_STEP}}

## Error scenarios

{{ERROR_SCENARIOS}}

<!-- toudocu:section postconditions -->
## Postconditions

{{POSTCONDITIONS}}

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [ ] {{ACCEPTANCE_CRITERION}}

<!-- toudocu:section business-rules -->
## Business rules

- {{BUSINESS_RULE_ID}} — {{BUSINESS_RULE_REFERENCE}}

<!-- toudocu:section implementation -->
## Implementation

- [{{MODULE_TITLE}}](../modules/{{MODULE_FILE}})
