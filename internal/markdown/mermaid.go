package markdown

import "strings"

const MermaidMaxBytes = 50_000

type MermaidPolicy struct {
	DiagramType            string
	TooLarge               bool
	ConfigurationForbidden bool
}

func (p MermaidPolicy) Valid() bool {
	return !p.TooLarge && !p.ConfigurationForbidden && p.DiagramType != ""
}

func CheckMermaid(source string) MermaidPolicy {
	policy := MermaidPolicy{TooLarge: len([]byte(source)) > MermaidMaxBytes}
	lines := strings.Split(source, "\n")
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "%%{") {
			policy.ConfigurationForbidden = true
			break
		}
	}
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		policy.ConfigurationForbidden = policy.ConfigurationForbidden || trimmed == "---" || trimmed == "+++"
		break
	}
	first := ""
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			first = strings.TrimSpace(line)
			break
		}
	}
	fields := strings.Fields(first)
	if len(fields) == 0 {
		return policy
	}
	switch fields[0] {
	case "flowchart":
		if len(fields) == 1 || (len(fields) == 2 && containsStringValue([]string{"TD", "TB", "BT", "LR", "RL"}, fields[1])) {
			policy.DiagramType = "flowchart"
		}
	case "stateDiagram-v2", "sequenceDiagram":
		if len(fields) == 1 {
			policy.DiagramType = fields[0]
		}
	}
	return policy
}
