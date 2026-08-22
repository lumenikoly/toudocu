package skillinstall

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var (
	renamePath   = os.Rename
	publishStage = atomicPublish
)

func Execute(plan Plan, cliVersion string) Result {
	result := Result{Plan: plan, State: plan.Before.State, Code: plan.Code}
	if plan.Conflict {
		return result
	}
	if plan.Action == "none" {
		return result
	}
	current := Inspect(plan.Target, plan.Bundle)
	if current.State != plan.Before.State || current.Fingerprint != plan.Before.Fingerprint {
		result.Code = "SKILL_TARGET_CHANGED"
		result.Error = errors.New("target changed after planning")
		return result
	}
	var err error
	switch plan.Action {
	case "create":
		err = installNew(plan, cliVersion)
	case "replace":
		err = replaceManaged(plan, cliVersion)
	case "remove":
		err = removeManaged(plan)
	default:
		err = fmt.Errorf("unknown action %q", plan.Action)
	}
	if err != nil {
		result.Error = err
		if coded := new(operationError); errors.As(err, &coded) {
			result.Code = coded.code
		} else {
			result.Code = "SKILL_OPERATION_FAILED"
		}
		return result
	}
	result.State = Inspect(plan.Target, plan.Bundle).State
	if plan.Action == "remove" {
		result.State = NotInstalled
	}
	return result
}

type operationError struct {
	code string
	err  error
}

func (err *operationError) Error() string { return err.err.Error() }
func (err *operationError) Unwrap() error { return err.err }

func installNew(plan Plan, cliVersion string) error {
	stage, err := prepareStage(plan, cliVersion)
	if err != nil {
		return err
	}
	defer func() { _ = os.RemoveAll(stage) }()
	if err := publishStage(stage, plan.Target.Path); err != nil {
		return &operationError{code: "SKILL_PUBLISH_FAILED", err: err}
	}
	return nil
}

func replaceManaged(plan Plan, cliVersion string) error {
	stage, err := prepareStage(plan, cliVersion)
	if err != nil {
		return err
	}
	defer func() { _ = os.RemoveAll(stage) }()
	backup, err := uniqueSibling(plan.Target.Path, "backup")
	if err != nil {
		return err
	}
	if err := renamePath(plan.Target.Path, backup); err != nil {
		return &operationError{code: "SKILL_BACKUP_FAILED", err: err}
	}
	backupTarget := plan.Target
	backupTarget.Path = backup
	if snapshot := Inspect(backupTarget, plan.Bundle); snapshot.State != plan.Before.State || snapshot.Fingerprint != plan.Before.Fingerprint {
		return restoreFailure(plan.Target.Path, backup, errors.New("target changed while creating backup"))
	}
	if err := publishStage(stage, plan.Target.Path); err != nil {
		return restoreFailure(plan.Target.Path, backup, err)
	}
	if err := os.RemoveAll(backup); err != nil {
		return &operationError{code: "SKILL_BACKUP_CLEANUP_FAILED", err: fmt.Errorf("new copy installed; backup retained at %s: %w", backup, err)}
	}
	return nil
}

func removeManaged(plan Plan) error {
	backup, err := uniqueSibling(plan.Target.Path, "backup")
	if err != nil {
		return err
	}
	if err := renamePath(plan.Target.Path, backup); err != nil {
		return &operationError{code: "SKILL_BACKUP_FAILED", err: err}
	}
	backupTarget := plan.Target
	backupTarget.Path = backup
	if snapshot := Inspect(backupTarget, plan.Bundle); snapshot.State != plan.Before.State || snapshot.Fingerprint != plan.Before.Fingerprint {
		return restoreFailure(plan.Target.Path, backup, errors.New("target changed while creating backup"))
	}
	if err := os.RemoveAll(backup); err != nil {
		return &operationError{code: "SKILL_UNINSTALL_FAILED", err: fmt.Errorf("installation moved to backup %s but could not be removed: %w", backup, err)}
	}
	return nil
}

func restoreFailure(target, backup string, cause error) error {
	if _, err := os.Lstat(target); err == nil {
		return &operationError{code: "SKILL_RESTORE_FAILED", err: fmt.Errorf("%v; backup retained at %s because target is occupied", cause, backup)}
	} else if !os.IsNotExist(err) {
		return &operationError{code: "SKILL_RESTORE_FAILED", err: fmt.Errorf("%v; backup retained at %s: %w", cause, backup, err)}
	}
	if err := renamePath(backup, target); err != nil {
		return &operationError{code: "SKILL_RESTORE_FAILED", err: fmt.Errorf("%v; backup retained at %s: %w", cause, backup, err)}
	}
	return &operationError{code: "SKILL_PUBLISH_FAILED", err: cause}
}

func prepareStage(plan Plan, cliVersion string) (string, error) {
	parent := filepath.Dir(plan.Target.Path)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return "", err
	}
	if err := validateTarget(plan.Target); err != nil {
		return "", &operationError{code: "SKILL_PATH_UNSAFE", err: err}
	}
	stage, err := os.MkdirTemp(parent, "."+filepath.Base(plan.Target.Path)+".stage-")
	if err != nil {
		return "", err
	}
	ok := false
	defer func() {
		if !ok {
			_ = os.RemoveAll(stage)
		}
	}()
	for _, file := range plan.Bundle.Files {
		destination := filepath.Join(stage, filepath.FromSlash(file.Path))
		rel, err := filepath.Rel(stage, destination)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
			return "", fmt.Errorf("invalid staged path %q", file.Path)
		}
		if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
			return "", err
		}
		handle, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, file.Mode.Perm())
		if err != nil {
			return "", err
		}
		_, writeErr := handle.Write(file.Data)
		closeErr := handle.Close()
		if writeErr != nil {
			return "", writeErr
		}
		if closeErr != nil {
			return "", closeErr
		}
	}
	manifest, err := json.MarshalIndent(newManifest(plan.Bundle, plan.Target, cliVersion), "", "  ")
	if err != nil {
		return "", err
	}
	manifest = append(manifest, '\n')
	if err := os.WriteFile(filepath.Join(stage, ManifestName), manifest, 0o644); err != nil {
		return "", err
	}
	ok = true
	return stage, nil
}

func uniqueSibling(target, kind string) (string, error) {
	parent := filepath.Dir(target)
	temporary, err := os.MkdirTemp(parent, "."+filepath.Base(target)+"."+kind+"-")
	if err != nil {
		return "", err
	}
	if err := os.Remove(temporary); err != nil {
		return "", err
	}
	return temporary, nil
}
