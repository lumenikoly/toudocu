package skillinstall

import (
	"fmt"

	"docu-docu/skills"
)

func BuildPlan(operation Operation, target Target, bundle skills.Bundle) Plan {
	snapshot := Inspect(target, bundle)
	plan := Plan{Operation: operation, Target: target, Before: snapshot, Bundle: bundle}
	conflict := func(code, message string) Plan {
		plan.Conflict, plan.Code, plan.Message = true, code, message
		return plan
	}
	switch operation {
	case Status:
		plan.Action = "none"
		return plan
	case Install:
		switch snapshot.State {
		case NotInstalled:
			plan.Action = "create"
		case Installed:
			plan.Action = "none"
		case Outdated:
			plan.Action = "replace"
		default:
			return conflict(codeForState(snapshot.State), recommendation(snapshot.State))
		}
	case Update:
		switch snapshot.State {
		case Installed:
			plan.Action = "none"
		case Outdated:
			plan.Action = "replace"
		case NotInstalled:
			return conflict("SKILL_NOT_INSTALLED", "run skill install first")
		default:
			return conflict(codeForState(snapshot.State), recommendation(snapshot.State))
		}
	case Uninstall:
		switch snapshot.State {
		case Installed, Outdated:
			plan.Action = "remove"
		case NotInstalled:
			plan.Action = "none"
		default:
			return conflict(codeForState(snapshot.State), recommendation(snapshot.State))
		}
	default:
		return conflict("SKILL_OPERATION_INVALID", fmt.Sprintf("unsupported operation %q", operation))
	}
	return plan
}

func codeForState(state State) string {
	switch state {
	case Modified:
		return "SKILL_LOCAL_CHANGES"
	case Unmanaged:
		return "SKILL_UNMANAGED"
	case InvalidManifest:
		return "SKILL_MANIFEST_INVALID"
	case UnsafePath:
		return "SKILL_PATH_UNSAFE"
	case Newer:
		return "SKILL_DOWNGRADE_BLOCKED"
	default:
		return "SKILL_CONFLICT"
	}
}

func recommendation(state State) string {
	switch state {
	case Modified:
		return "preserve or remove local changes manually, then retry"
	case Unmanaged:
		return "move or remove the unmanaged directory manually, then retry"
	case InvalidManifest:
		return "inspect the manifest and repair or remove the target manually"
	case UnsafePath:
		return "replace symlinks or unsafe path components manually, then retry"
	case Newer:
		return "keep the newer installation or remove it manually before installing this bundle"
	default:
		return "resolve the target manually, then retry"
	}
}
