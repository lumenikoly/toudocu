# {{SCREEN_ID}}: {{SCREEN_TITLE}}

- Identifier: {{SCREEN_ID}}
- Type: {{SCREEN_TYPE}}
- Module: {{MODULE_ID}}
- Status: {{SCREEN_STATUS}}
{{OPTIONAL_ROUTE_METADATA}}
{{OPTIONAL_PREVIEW_METADATA}}
{{OPTIONAL_PARENT_METADATA}}
{{OPTIONAL_COMPONENT_METADATA}}
- Last updated: {{YYYY-MM-DD}}

{{SCREEN_PURPOSE}}

## States

| ID | Name | Preview |
|---|---|---|
{{STATE_ROWS}}

## Transitions

| ID | Use case | Action | Condition | Result | State | Error | Message | Contract | Type |
|---|---|---|---|---|---|---|---|---|---|
{{TRANSITION_ROWS}}

## Related use cases

- [{{USE_CASE_ID}}]({{USE_CASE_LINK}})
