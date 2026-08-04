package docgent

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"go.yaml.in/yaml/v3"
)

var openAPIMethods = []string{"get", "put", "post", "delete", "options", "head", "patch", "trace"}

func parseOpenAPI(content []byte) (map[string]any, error) {
	if len(content) == 0 {
		return nil, nil
	}
	var value any
	if err := yaml.Unmarshal(content, &value); err != nil {
		return nil, err
	}
	document, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("корень OpenAPI должен быть объектом")
	}
	if _, ok := document["openapi"]; !ok {
		return nil, fmt.Errorf("поле openapi отсутствует")
	}
	return document, nil
}

func openAPIDiff(oldContent, newContent []byte, oldPath, newPath string) ([]SemanticChange, []Issue, bool) {
	oldSpec, oldErr := parseOpenAPI(oldContent)
	newSpec, newErr := parseOpenAPI(newContent)
	diagnostics := []Issue{}
	if oldErr != nil && len(oldContent) > 0 {
		diagnostics = append(diagnostics, Issue{Severity: "warning", Code: "openapi-old-version-invalid", Message: oldErr.Error(), DocumentPath: oldPath})
	}
	if newErr != nil && len(newContent) > 0 {
		diagnostics = append(diagnostics, Issue{Severity: "warning", Code: "openapi-new-version-invalid", Message: newErr.Error(), DocumentPath: newPath})
	}
	if oldErr != nil || newErr != nil {
		return []SemanticChange{}, diagnostics, false
	}
	entity := ChangeEntity{ID: contractID(newPath), Type: "contract", Title: newPath}
	if entity.ID == "" {
		entity.ID = contractID(oldPath)
	}
	changes := []SemanticChange{}
	changes = append(changes, compareOpenAPIRoot(entity, oldSpec, newSpec)...)
	oldOperations, newOperations := collectOpenAPIOperations(oldSpec), collectOpenAPIOperations(newSpec)
	keys := unionSortedKeys(oldOperations, newOperations)
	for _, key := range keys {
		oldOperation, oldOK := oldOperations[key]
		newOperation, newOK := newOperations[key]
		switch {
		case !oldOK:
			changes = append(changes, openAPIChange("contract-operation-added", entity, key, nil, newOperation, "non-breaking", "Добавлена операция "+key+"."))
		case !newOK:
			changes = append(changes, openAPIChange("contract-operation-removed", entity, key, oldOperation, nil, "breaking", "Удалена операция "+key+"."))
		default:
			changes = append(changes, compareOpenAPIOperation(entity, key, oldOperation, newOperation)...)
		}
	}
	oldSchemas, newSchemas := nestedMap(oldSpec, "components", "schemas"), nestedMap(newSpec, "components", "schemas")
	for _, name := range unionSortedKeys(oldSchemas, newSchemas) {
		oldValue, oldOK := oldSchemas[name]
		newValue, newOK := newSchemas[name]
		if oldOK && newOK && jsonEqual(oldValue, newValue) {
			continue
		}
		compatibility, kind := "informational", "field-changed"
		if !oldOK {
			compatibility, kind = "non-breaking", "field-added"
		} else if !newOK {
			compatibility, kind = "breaking", "field-removed"
		}
		if !oldOK || !newOK {
			changes = append(changes, openAPIChange(kind, entity, "components.schemas."+name, oldValue, newValue, compatibility, fmt.Sprintf("Изменена schema %s.", name)))
			continue
		}
		changes = append(changes, compareOpenAPISchema(entity, "components.schemas."+name, oldValue, newValue)...)
	}
	for _, change := range changes {
		if change.Compatibility == "breaking" {
			diagnostics = append(diagnostics, Issue{Severity: "warning", Code: "openapi-breaking-change", Message: change.Summary, DocumentPath: newPath})
		}
	}
	return changes, diagnostics, true
}

func compareOpenAPIRoot(entity ChangeEntity, oldSpec, newSpec map[string]any) []SemanticChange {
	changes := []SemanticChange{}
	for _, field := range []string{"openapi", "info", "servers", "tags", "webhooks"} {
		oldValue, oldOK := oldSpec[field]
		newValue, newOK := newSpec[field]
		if oldOK == newOK && jsonEqual(oldValue, newValue) {
			continue
		}
		compatibility := "informational"
		if field == "webhooks" && oldOK && !newOK {
			compatibility = "breaking"
		}
		changes = append(changes, openAPIChange("field-changed", entity, field, emptyOpenAPIValue(oldValue, oldOK), emptyOpenAPIValue(newValue, newOK), compatibility, "Изменён OpenAPI элемент "+field+"."))
	}
	changes = append(changes, compareNamedOpenAPIValues(entity, "components.securitySchemes", nestedMap(oldSpec, "components", "securitySchemes"), nestedMap(newSpec, "components", "securitySchemes"), "potentially-breaking")...)
	return changes
}

func collectOpenAPIOperations(spec map[string]any) map[string]any {
	result := map[string]any{}
	paths, _ := spec["paths"].(map[string]any)
	for path, raw := range paths {
		item, _ := raw.(map[string]any)
		for _, method := range openAPIMethods {
			if operation, ok := item[method]; ok {
				result[strings.ToUpper(method)+" "+path] = operation
			}
		}
	}
	return result
}

func compareOpenAPIOperation(entity ChangeEntity, key string, oldRaw, newRaw any) []SemanticChange {
	oldOperation, _ := oldRaw.(map[string]any)
	newOperation, _ := newRaw.(map[string]any)
	changes := []SemanticChange{}
	for _, field := range []string{"operationId", "callbacks"} {
		oldValue, oldOK := oldOperation[field]
		newValue, newOK := newOperation[field]
		if oldOK == newOK && jsonEqual(oldValue, newValue) {
			continue
		}
		compatibility := "potentially-breaking"
		if !oldOK {
			if field == "parameters" && !containsRequiredParameter(newValue) {
				compatibility = "non-breaking"
			}
		} else if !newOK {
			compatibility = "breaking"
		}
		changes = append(changes, openAPIChange("contract-operation-changed", entity, key+"."+field, oldValue, newValue, compatibility, fmt.Sprintf("%s: изменено поле %s.", key, field)))
	}
	changes = append(changes, compareOpenAPIParameters(entity, key, oldOperation["parameters"], newOperation["parameters"])...)
	changes = append(changes, compareOpenAPIRequestBody(entity, key, oldOperation["requestBody"], newOperation["requestBody"])...)
	changes = append(changes, compareOpenAPISecurity(entity, key, oldOperation["security"], newOperation["security"])...)
	oldResponses, _ := oldOperation["responses"].(map[string]any)
	newResponses, _ := newOperation["responses"].(map[string]any)
	for _, response := range unionSortedKeys(oldResponses, newResponses) {
		oldValue, oldOK := oldResponses[response]
		newValue, newOK := newResponses[response]
		if oldOK && newOK && jsonEqual(oldValue, newValue) {
			continue
		}
		compatibility := "potentially-breaking"
		kind := "contract-operation-changed"
		verb := "изменён"
		if !oldOK {
			compatibility, verb = "non-breaking", "добавлен"
		} else if !newOK {
			compatibility, verb = "breaking", "удалён"
		}
		changes = append(changes, openAPIChange(kind, entity, key+".responses."+response, oldValue, newValue, compatibility, fmt.Sprintf("%s: %s response %s.", key, verb, response)))
		if oldOK && newOK {
			changes = append(changes, compareOpenAPIResponseHeaders(entity, key+".responses."+response, oldValue, newValue)...)
		}
	}
	return changes
}

func compareOpenAPIParameters(entity ChangeEntity, operation string, oldRaw, newRaw any) []SemanticChange {
	oldParameters, newParameters := openAPIParameterMap(oldRaw), openAPIParameterMap(newRaw)
	changes := []SemanticChange{}
	for _, key := range unionSortedKeys(oldParameters, newParameters) {
		oldValue, oldOK := oldParameters[key]
		newValue, newOK := newParameters[key]
		if oldOK && newOK && jsonEqual(oldValue, newValue) {
			continue
		}
		compatibility, verb := "potentially-breaking", "изменён"
		if !oldOK {
			verb = "добавлен"
			if !openAPIRequired(newValue) {
				compatibility = "non-breaking"
			} else {
				compatibility = "breaking"
			}
		} else if !newOK {
			compatibility, verb = "potentially-breaking", "удалён"
		}
		changes = append(changes, openAPIChange("contract-operation-changed", entity, operation+".parameters."+key, emptyOpenAPIValue(oldValue, oldOK), emptyOpenAPIValue(newValue, newOK), compatibility, fmt.Sprintf("%s: %s parameter %s.", operation, verb, key)))
	}
	return changes
}

func compareOpenAPIRequestBody(entity ChangeEntity, operation string, oldRaw, newRaw any) []SemanticChange {
	if jsonEqual(oldRaw, newRaw) {
		return nil
	}
	compatibility := "potentially-breaking"
	if oldRaw == nil && newRaw != nil {
		if openAPIRequired(newRaw) {
			compatibility = "breaking"
		} else {
			compatibility = "non-breaking"
		}
	} else if oldRaw != nil && newRaw == nil {
		compatibility = "non-breaking"
	}
	return []SemanticChange{openAPIChange("contract-operation-changed", entity, operation+".requestBody", oldRaw, newRaw, compatibility, operation+": изменён request body.")}
}

func compareOpenAPISecurity(entity ChangeEntity, operation string, oldRaw, newRaw any) []SemanticChange {
	if jsonEqual(oldRaw, newRaw) {
		return nil
	}
	compatibility := "potentially-breaking"
	if securityAlternativesRemoved(oldRaw, newRaw) {
		compatibility = "breaking"
	}
	return []SemanticChange{openAPIChange("contract-operation-changed", entity, operation+".security", oldRaw, newRaw, compatibility, operation+": изменены security alternatives.")}
}

func compareOpenAPIResponseHeaders(entity ChangeEntity, field string, oldRaw, newRaw any) []SemanticChange {
	oldHeaders, newHeaders := nestedMap(asOpenAPIMap(oldRaw), "headers"), nestedMap(asOpenAPIMap(newRaw), "headers")
	return compareNamedOpenAPIValues(entity, field+".headers", oldHeaders, newHeaders, "potentially-breaking")
}

func compareOpenAPISchema(entity ChangeEntity, field string, oldRaw, newRaw any) []SemanticChange {
	oldSchema, newSchema := asOpenAPIMap(oldRaw), asOpenAPIMap(newRaw)
	changes := []SemanticChange{}
	for _, key := range []string{"type", "format", "nullable", "additionalProperties"} {
		oldValue, oldOK := oldSchema[key]
		newValue, newOK := newSchema[key]
		if oldOK == newOK && jsonEqual(oldValue, newValue) {
			continue
		}
		compatibility := "potentially-breaking"
		if key == "type" || key == "format" || (key == "additionalProperties" && newValue == false) {
			compatibility = "breaking"
		}
		changes = append(changes, openAPIChange("field-changed", entity, field+"."+key, emptyOpenAPIValue(oldValue, oldOK), emptyOpenAPIValue(newValue, newOK), compatibility, "Изменено schema field "+field+"."+key+"."))
	}
	oldEnum, newEnum := stringSet(oldSchema["enum"]), stringSet(newSchema["enum"])
	if !stringSetEqual(oldEnum, newEnum) {
		compatibility := "non-breaking"
		if !stringSetSubset(oldEnum, newEnum) {
			compatibility = "breaking"
		}
		changes = append(changes, openAPIChange("field-changed", entity, field+".enum", oldSchema["enum"], newSchema["enum"], compatibility, "Изменён enum "+field+"."))
	}
	oldProperties, newProperties := nestedMap(oldSchema, "properties"), nestedMap(newSchema, "properties")
	oldRequired, newRequired := stringSet(oldSchema["required"]), stringSet(newSchema["required"])
	for _, name := range unionSortedKeys(oldProperties, newProperties) {
		oldValue, oldOK := oldProperties[name]
		newValue, newOK := newProperties[name]
		propertyField := field + ".properties." + name
		if !oldOK || !newOK {
			compatibility, kind := "non-breaking", "field-added"
			verb := "Добавлено"
			if !newOK {
				compatibility, kind, verb = "breaking", "field-removed", "Удалено"
			}
			changes = append(changes, openAPIChange(kind, entity, propertyField, emptyOpenAPIValue(oldValue, oldOK), emptyOpenAPIValue(newValue, newOK), compatibility, verb+" schema property "+name+"."))
			continue
		}
		changes = append(changes, compareOpenAPISchema(entity, propertyField, oldValue, newValue)...)
	}
	for name := range newRequired {
		if !oldRequired[name] {
			changes = append(changes, openAPIChange("field-changed", entity, field+".required."+name, false, true, "breaking", "Свойство "+name+" стало обязательным."))
		}
	}
	for name := range oldRequired {
		if !newRequired[name] {
			changes = append(changes, openAPIChange("field-changed", entity, field+".required."+name, true, false, "non-breaking", "Свойство "+name+" перестало быть обязательным."))
		}
	}
	return changes
}

func compareNamedOpenAPIValues(entity ChangeEntity, prefix string, oldValues, newValues map[string]any, removalCompatibility string) []SemanticChange {
	changes := []SemanticChange{}
	for _, name := range unionSortedKeys(oldValues, newValues) {
		oldValue, oldOK := oldValues[name]
		newValue, newOK := newValues[name]
		if oldOK && newOK && jsonEqual(oldValue, newValue) {
			continue
		}
		compatibility, kind, verb := "informational", "field-changed", "Изменён"
		if !oldOK {
			compatibility, kind, verb = "non-breaking", "field-added", "Добавлен"
		}
		if !newOK {
			compatibility, kind, verb = removalCompatibility, "field-removed", "Удалён"
		}
		changes = append(changes, openAPIChange(kind, entity, prefix+"."+name, emptyOpenAPIValue(oldValue, oldOK), emptyOpenAPIValue(newValue, newOK), compatibility, verb+" OpenAPI элемент "+prefix+"."+name+"."))
	}
	return changes
}

func asOpenAPIMap(value any) map[string]any {
	if mapped, ok := value.(map[string]any); ok {
		return mapped
	}
	return map[string]any{}
}

func emptyOpenAPIValue(value any, exists bool) any {
	if !exists {
		return nil
	}
	return value
}

func openAPIParameterMap(value any) map[string]any {
	parameters, _ := value.([]any)
	result := map[string]any{}
	for _, raw := range parameters {
		parameter := asOpenAPIMap(raw)
		name, in := fmt.Sprint(parameter["name"]), fmt.Sprint(parameter["in"])
		if name == "" || name == "<nil>" || in == "" || in == "<nil>" {
			continue
		}
		result[in+":"+name] = raw
	}
	return result
}

func openAPIRequired(value any) bool {
	return asOpenAPIMap(value)["required"] == true
}

func securityAlternativesRemoved(oldRaw, newRaw any) bool {
	oldValues, newValues := securityAlternativeSet(oldRaw), securityAlternativeSet(newRaw)
	return !stringSetSubset(oldValues, newValues)
}

func securityAlternativeSet(value any) map[string]bool {
	items, _ := value.([]any)
	result := map[string]bool{}
	for _, item := range items {
		encoded, _ := json.Marshal(item)
		result[string(encoded)] = true
	}
	return result
}

func stringSet(value any) map[string]bool {
	result := map[string]bool{}
	items, _ := value.([]any)
	for _, item := range items {
		result[fmt.Sprint(item)] = true
	}
	return result
}

func stringSetSubset(left, right map[string]bool) bool {
	for value := range left {
		if !right[value] {
			return false
		}
	}
	return true
}

func stringSetEqual(left, right map[string]bool) bool {
	return len(left) == len(right) && stringSetSubset(left, right)
}

func openAPIChange(kind string, entity ChangeEntity, field string, before, after any, compatibility, summary string) SemanticChange {
	return SemanticChange{Kind: kind, Entity: entity, Field: field, Before: before, After: after, Compatibility: compatibility, Summary: summary}
}
func contractID(path string) string {
	if id := stableEntityIDRE.FindString(strings.ToUpper(path)); strings.HasPrefix(id, "CONTRACT-") {
		return id
	}
	return ""
}
func jsonEqual(left, right any) bool {
	a, _ := json.Marshal(left)
	b, _ := json.Marshal(right)
	return string(a) == string(b)
}
func containsRequiredParameter(value any) bool {
	list, _ := value.([]any)
	for _, item := range list {
		parameter, _ := item.(map[string]any)
		required, _ := parameter["required"].(bool)
		if required {
			return true
		}
	}
	return false
}
func nestedMap(value map[string]any, keys ...string) map[string]any {
	current := value
	for _, key := range keys {
		next, _ := current[key].(map[string]any)
		if next == nil {
			return map[string]any{}
		}
		current = next
	}
	return current
}
func unionSortedKeys(left, right map[string]any) []string {
	seen := map[string]bool{}
	for key := range left {
		seen[key] = true
	}
	for key := range right {
		seen[key] = true
	}
	keys := make([]string, 0, len(seen))
	for key := range seen {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
