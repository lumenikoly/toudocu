<!-- toudocu
version: 1
id: {{SCREEN_ID}}
status: {{SCREEN_STATUS}}
screenKind: {{SCREEN_TYPE}}
module: {{MODULE_ID}}
updated: {{YYYY-MM-DD}}
{{OPTIONAL_COMPONENT_METADATA}}
{{OPTIONAL_PARENT_METADATA}}
{{OPTIONAL_PREVIEW_METADATA}}
{{OPTIONAL_ROUTE_METADATA}}
-->

# {{SCREEN_ID}}: {{SCREEN_TITLE}}

{{SCREEN_PURPOSE}}

## Состояния

<!-- toudocu:table states columns=id,title,preview -->
| ID | Название | Превью |
|---|---|---|
{{STATE_ROWS}}

## Переходы

<!-- toudocu:table transitions columns=id,useCase,action,condition,target,state,error,message,contract,kind -->
| ID | Сценарий | Действие | Условие | Результат | Состояние | Ошибка | Сообщение | Контракт | Тип |
|---|---|---|---|---|---|---|---|---|---|
{{TRANSITION_ROWS}}

<!-- toudocu:section related-use-cases -->
## Связанные сценарии

- [{{USE_CASE_ID}}]({{USE_CASE_LINK}})
