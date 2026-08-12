package toudocu

import (
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"go.yaml.in/yaml/v3"
)

// OpenAPIContract is a validated wire-level contract discovered below contracts/.
type OpenAPIContract struct {
	Path    string
	Title   string
	Version string
}

var openAPIHTTPMethods = map[string]struct{}{
	"get": {}, "put": {}, "post": {}, "delete": {}, "options": {}, "head": {}, "patch": {}, "trace": {},
}

var (
	openAPIVersionRE  = regexp.MustCompile(`^3\.(0|1)\.\d+(?:[-+][0-9A-Za-z.-]+)?$`)
	openAPIResponseRE = regexp.MustCompile(`^(?:default|[1-5](?:\d{2}|XX))$`)
)

var openAPIPathItemFields = map[string]struct{}{
	"$ref": {}, "summary": {}, "description": {}, "servers": {}, "parameters": {},
}

func isOpenAPIContractPath(filePath string) bool {
	normalized := strings.ToLower(path.Clean(filepath.ToSlash(filePath)))
	if !strings.HasPrefix(normalized, "contracts/") {
		return false
	}
	return strings.HasSuffix(normalized, ".openapi.yaml") || strings.HasSuffix(normalized, ".openapi.yml") || strings.HasSuffix(normalized, ".openapi.json")
}

func discoverOpenAPIContracts(root string, customExcludes []string, overlay map[string][]byte) ([]OpenAPIContract, []Issue) {
	excludes := map[string]struct{}{}
	for _, value := range append(append([]string{}, defaultExcludes...), customExcludes...) {
		if value = strings.TrimSpace(value); value != "" {
			excludes[normalizeSlashes(value)] = struct{}{}
		}
	}
	contracts := []OpenAPIContract{}
	issues := []Issue{}
	contractsRoot := filepath.Join(root, "contracts")
	_ = filepath.WalkDir(contractsRoot, func(filePath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if !os.IsNotExist(walkErr) {
				issues = append(issues, newIssue("error", "openapi-read-failed", walkErr.Error(), toPosixRelative(root, filePath), 0))
			}
			return nil
		}
		if filePath == contractsRoot {
			return nil
		}
		relative := toPosixRelative(root, filePath)
		info, err := os.Lstat(filePath)
		if err != nil {
			issues = append(issues, newIssue("error", "openapi-read-failed", err.Error(), relative, 0))
			return nil
		}
		if info.Mode()&os.ModeSymlink != 0 {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if info.IsDir() {
			if shouldExclude(relative, entry.Name(), excludes) {
				return filepath.SkipDir
			}
			return nil
		}
		if !info.Mode().IsRegular() || !isOpenAPIContractPath(relative) {
			return nil
		}
		content, ok := overlay[relative]
		if !ok {
			content, err = os.ReadFile(filePath)
		}
		if err != nil {
			issues = append(issues, newIssue("error", "openapi-read-failed", err.Error(), relative, 0))
			return nil
		}
		contract, validation := parseOpenAPIContract(relative, content)
		issues = append(issues, validation...)
		if len(validation) == 0 {
			contracts = append(contracts, contract)
		}
		return nil
	})
	sort.Slice(contracts, func(i, j int) bool { return naturalCompare(contracts[i].Path, contracts[j].Path) < 0 })
	return contracts, issues
}

func validateOpenAPIContract(filePath string, content []byte) []Issue {
	_, issues := parseOpenAPIContract(filePath, content)
	return issues
}

func parseOpenAPIContract(filePath string, content []byte) (OpenAPIContract, []Issue) {
	contract := OpenAPIContract{Path: filepath.ToSlash(filePath)}
	if len(content) > 4<<20 {
		return contract, []Issue{openAPIIssue("openapi-document-too-large", "The OpenAPI document exceeds 4 MiB.", filePath, 0, 0)}
	}
	var document yaml.Node
	if err := yaml.Unmarshal(content, &document); err != nil {
		line, column := yamlErrorLocation(err)
		return contract, []Issue{openAPIIssue("openapi-syntax-error", "Invalid OpenAPI YAML/JSON: "+err.Error(), filePath, line, column)}
	}
	root := documentMapping(&document)
	if root == nil {
		location := &document
		if len(document.Content) > 0 {
			location = document.Content[0]
		}
		return contract, []Issue{openAPIIssue("openapi-invalid-root", "The OpenAPI document must be an object.", filePath, nodeLine(location), nodeColumn(location))}
	}
	issues := []Issue{}
	if limitIssue := validateOpenAPIStructureLimits(filePath, root); limitIssue != nil {
		return contract, []Issue{*limitIssue}
	}
	openapi := mappingValue(root, "openapi")
	if openapi == nil || openapi.Kind != yaml.ScalarNode || !openAPIVersionRE.MatchString(openapi.Value) {
		issues = append(issues, openAPIIssue("openapi-invalid-version", "The openapi field must declare OpenAPI 3.0.x or 3.1.x.", filePath, nodeLine(openapiOrRoot(openapi, root)), nodeColumn(openapiOrRoot(openapi, root))))
	} else {
		contract.Version = openapi.Value
	}
	info := mappingValue(root, "info")
	if info == nil || info.Kind != yaml.MappingNode {
		issues = append(issues, openAPIIssue("openapi-missing-info", "Required field info must be an object.", filePath, root.Line, root.Column))
	} else {
		title := mappingValue(info, "title")
		version := mappingValue(info, "version")
		if title == nil || strings.TrimSpace(title.Value) == "" {
			issues = append(issues, openAPIIssue("openapi-missing-info-title", "Required field info.title is missing.", filePath, info.Line, info.Column))
		} else {
			contract.Title = title.Value
		}
		if version == nil || strings.TrimSpace(version.Value) == "" {
			issues = append(issues, openAPIIssue("openapi-missing-info-version", "Required field info.version is missing.", filePath, info.Line, info.Column))
		}
	}
	paths := mappingValue(root, "paths")
	if paths == nil || paths.Kind != yaml.MappingNode {
		issues = append(issues, openAPIIssue("openapi-missing-paths", "Required field paths must be an object.", filePath, root.Line, root.Column))
	} else {
		issues = append(issues, validateOpenAPIPaths(filePath, root, paths)...)
	}
	issues = append(issues, validateInternalOpenAPIRefs(filePath, root)...)
	return contract, issues
}

func validateOpenAPIStructureLimits(filePath string, root *yaml.Node) *Issue {
	nodes, aliases := 0, 0
	var walk func(*yaml.Node, int) *Issue
	walk = func(node *yaml.Node, depth int) *Issue {
		nodes++
		if node.Kind == yaml.AliasNode {
			aliases++
		}
		if depth > 100 || nodes > 100000 || aliases > 1000 {
			issue := openAPIIssue("openapi-structure-limit", "The OpenAPI document exceeds the allowed depth, node count, or alias count.", filePath, node.Line, node.Column)
			return &issue
		}
		for _, child := range node.Content {
			if issue := walk(child, depth+1); issue != nil {
				return issue
			}
		}
		return nil
	}
	return walk(root, 1)
}

func validateOpenAPIPaths(filePath string, root, paths *yaml.Node) []Issue {
	issues := []Issue{}
	operationIDs := map[string]*yaml.Node{}
	for i := 0; i+1 < len(paths.Content); i += 2 {
		pathNode, item := paths.Content[i], paths.Content[i+1]
		if !strings.HasPrefix(pathNode.Value, "/") || item.Kind != yaml.MappingNode {
			issues = append(issues, openAPIIssue("openapi-invalid-path", "Every paths key must start with / and contain a Path Item object.", filePath, pathNode.Line, pathNode.Column))
			continue
		}
		pathParams := openAPIParameters(root, item)
		for j := 0; j+1 < len(item.Content); j += 2 {
			methodNode, operation := item.Content[j], item.Content[j+1]
			method := strings.ToLower(methodNode.Value)
			if _, ok := openAPIHTTPMethods[method]; !ok {
				if _, known := openAPIPathItemFields[method]; !known && !strings.HasPrefix(strings.ToLower(method), "x-") {
					issues = append(issues, openAPIIssue("openapi-invalid-path-item-key", "Unknown Path Item field: "+methodNode.Value, filePath, methodNode.Line, methodNode.Column))
				}
				continue
			}
			if operation.Kind != yaml.MappingNode {
				issues = append(issues, openAPIIssue("openapi-invalid-operation", strings.ToUpper(method)+" "+pathNode.Value+" must be an object.", filePath, operation.Line, operation.Column))
				continue
			}
			operationID := mappingValue(operation, "operationId")
			if operationID == nil || strings.TrimSpace(operationID.Value) == "" {
				issues = append(issues, openAPIIssue("openapi-missing-operation-id", strings.ToUpper(method)+" "+pathNode.Value+" has no operationId.", filePath, operation.Line, operation.Column))
			} else if previous := operationIDs[operationID.Value]; previous != nil {
				issues = append(issues, openAPIIssue("openapi-duplicate-operation-id", fmt.Sprintf("operationId %q is already declared on line %d.", operationID.Value, previous.Line), filePath, operationID.Line, operationID.Column))
			} else {
				operationIDs[operationID.Value] = operationID
			}
			responses := mappingValue(operation, "responses")
			if responses == nil || responses.Kind != yaml.MappingNode || len(responses.Content) == 0 {
				issues = append(issues, openAPIIssue("openapi-missing-responses", strings.ToUpper(method)+" "+pathNode.Value+" has no responses.", filePath, operation.Line, operation.Column))
			} else {
				issues = append(issues, validateOpenAPIResponses(filePath, method, pathNode.Value, responses)...)
			}
			params := append([]string{}, pathParams...)
			params = append(params, openAPIParameters(root, operation)...)
			for _, name := range pathTemplateParameters(pathNode.Value) {
				if !openAPIContainsString(params, name) {
					issues = append(issues, openAPIIssue("openapi-missing-path-parameter", fmt.Sprintf("Path parameter {%s} is not declared as required in:path.", name), filePath, operation.Line, operation.Column))
				}
			}
		}
	}
	return issues
}

func validateOpenAPIResponses(filePath, method, pathValue string, responses *yaml.Node) []Issue {
	issues := []Issue{}
	for i := 0; i+1 < len(responses.Content); i += 2 {
		status, response := responses.Content[i], responses.Content[i+1]
		if !openAPIResponseRE.MatchString(status.Value) {
			issues = append(issues, openAPIIssue("openapi-invalid-response-status", "Invalid response status "+status.Value+" for "+strings.ToUpper(method)+" "+pathValue+".", filePath, status.Line, status.Column))
		}
		if response.Kind != yaml.MappingNode {
			issues = append(issues, openAPIIssue("openapi-invalid-response", "Response "+status.Value+" must be an object.", filePath, response.Line, response.Column))
			continue
		}
		if mappingScalar(response, "$ref") == "" {
			description := mappingValue(response, "description")
			if description == nil || description.Kind != yaml.ScalarNode || strings.TrimSpace(description.Value) == "" {
				issues = append(issues, openAPIIssue("openapi-missing-response-description", "Response "+status.Value+" has no description.", filePath, response.Line, response.Column))
			}
		}
	}
	return issues
}

func openAPIParameters(root, node *yaml.Node) []string {
	parameters := mappingValue(node, "parameters")
	if parameters == nil || parameters.Kind != yaml.SequenceNode {
		return nil
	}
	result := []string{}
	for _, parameter := range parameters.Content {
		if ref := mappingScalar(parameter, "$ref"); strings.HasPrefix(ref, "#/") {
			if resolved := resolveYAMLPointer(root, ref); resolved != nil {
				parameter = resolved
			}
		}
		if parameter.Kind != yaml.MappingNode || mappingScalar(parameter, "in") != "path" || mappingScalar(parameter, "required") != "true" {
			continue
		}
		if name := mappingScalar(parameter, "name"); name != "" {
			result = append(result, name)
		}
	}
	return result
}

func validateInternalOpenAPIRefs(filePath string, root *yaml.Node) []Issue {
	issues := []Issue{}
	var visit func(*yaml.Node)
	visit = func(node *yaml.Node) {
		if node.Kind == yaml.MappingNode {
			for i := 0; i+1 < len(node.Content); i += 2 {
				key, value := node.Content[i], node.Content[i+1]
				if key.Value == "$ref" && value.Kind == yaml.ScalarNode && strings.HasPrefix(value.Value, "#/") && resolveYAMLPointer(root, value.Value) == nil {
					issues = append(issues, openAPIIssue("openapi-unresolved-internal-ref", "Internal $ref cannot be resolved: "+value.Value, filePath, value.Line, value.Column))
				}
				visit(value)
			}
		} else {
			for _, child := range node.Content {
				visit(child)
			}
		}
	}
	visit(root)
	return issues
}

func resolveYAMLPointer(root *yaml.Node, ref string) *yaml.Node {
	current := root
	for _, token := range strings.Split(strings.TrimPrefix(ref, "#/"), "/") {
		token = strings.ReplaceAll(strings.ReplaceAll(token, "~1", "/"), "~0", "~")
		current = mappingValue(current, token)
		if current == nil {
			return nil
		}
	}
	return current
}

func openAPIOperations(root *yaml.Node) map[string]map[string]struct{} {
	result := map[string]map[string]struct{}{}
	paths := mappingValue(root, "paths")
	if paths == nil || paths.Kind != yaml.MappingNode {
		return result
	}
	for i := 0; i+1 < len(paths.Content); i += 2 {
		item := paths.Content[i+1]
		for j := 0; item != nil && j+1 < len(item.Content); j += 2 {
			method := strings.ToUpper(item.Content[j].Value)
			if _, ok := openAPIHTTPMethods[strings.ToLower(method)]; ok {
				if result[paths.Content[i].Value] == nil {
					result[paths.Content[i].Value] = map[string]struct{}{}
				}
				result[paths.Content[i].Value][method] = struct{}{}
			}
		}
	}
	return result
}

func documentMapping(document *yaml.Node) *yaml.Node {
	if document == nil {
		return nil
	}
	if document.Kind == yaml.DocumentNode && len(document.Content) == 1 {
		document = document.Content[0]
	}
	if document.Kind != yaml.MappingNode {
		return nil
	}
	return document
}

func mappingValue(node *yaml.Node, key string) *yaml.Node {
	if node == nil || node.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(node.Content); i += 2 {
		if node.Content[i].Value == key {
			return node.Content[i+1]
		}
	}
	return nil
}

func mappingScalar(node *yaml.Node, key string) string {
	value := mappingValue(node, key)
	if value == nil || value.Kind != yaml.ScalarNode {
		return ""
	}
	return value.Value
}

func pathTemplateParameters(value string) []string {
	result := []string{}
	for {
		start := strings.IndexByte(value, '{')
		if start < 0 {
			return result
		}
		value = value[start+1:]
		end := strings.IndexByte(value, '}')
		if end < 0 {
			return result
		}
		result = append(result, value[:end])
		value = value[end+1:]
	}
}

func openAPIContainsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func openAPIIssue(code, message, filePath string, line, column int) Issue {
	return Issue{Severity: "error", Code: code, Message: message, DocumentPath: filepath.ToSlash(filePath), Line: line, Column: column}
}

func yamlErrorLocation(err error) (int, int) {
	var line, column int
	_, _ = fmt.Sscanf(err.Error(), "yaml: line %d: column %d:", &line, &column)
	if line == 0 {
		_, _ = fmt.Sscanf(err.Error(), "yaml: line %d:", &line)
	}
	return line, column
}

func nodeLine(node *yaml.Node) int {
	if node == nil {
		return 0
	}
	return node.Line
}

func nodeColumn(node *yaml.Node) int {
	if node == nil {
		return 0
	}
	return node.Column
}

func openapiOrRoot(node, root *yaml.Node) *yaml.Node {
	if node != nil {
		return node
	}
	return root
}
