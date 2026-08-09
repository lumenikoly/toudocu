package skillinstall

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"toudocu/skills"
)

func Inspect(target Target, bundle skills.Bundle) Snapshot {
	if err := validateTarget(target); err != nil {
		return Snapshot{State: UnsafePath, Detail: err.Error()}
	}
	info, err := os.Lstat(target.Path)
	if os.IsNotExist(err) {
		return Snapshot{State: NotInstalled, Fingerprint: "missing"}
	}
	if err != nil || !info.IsDir() || isReparseOrSymlink(info) {
		return Snapshot{State: UnsafePath, Detail: "target is not a regular directory"}
	}
	fingerprint, files, unsafe, err := scanTree(target.Path)
	if err != nil {
		return Snapshot{State: UnsafePath, Detail: err.Error()}
	}
	if unsafe {
		return Snapshot{State: Modified, Fingerprint: fingerprint, Detail: "managed file set contains a symlink or non-regular file"}
	}
	manifestFile, ok := files[ManifestName]
	if !ok {
		return Snapshot{State: Unmanaged, Fingerprint: fingerprint, Detail: "management manifest is absent"}
	}
	manifestData := manifestFile.data
	if !modeMatches(manifestFile.mode, 0o644) {
		return Snapshot{State: Modified, Fingerprint: fingerprint, Detail: "management manifest mode changed"}
	}
	if len(manifestData) > 2<<20 {
		return Snapshot{State: InvalidManifest, Fingerprint: fingerprint, Detail: "manifest exceeds size limit"}
	}
	var manifest Manifest
	decoder := json.NewDecoder(bytes.NewReader(manifestData))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return Snapshot{State: InvalidManifest, Fingerprint: fingerprint, Detail: "manifest is not valid schema v1 JSON"}
	}
	if err := validateManifest(manifest, target); err != nil {
		return Snapshot{State: InvalidManifest, Fingerprint: fingerprint, Detail: err.Error()}
	}
	declared := make(map[string]string, len(manifest.Files))
	for _, file := range manifest.Files {
		declared[file.Path] = file.SHA256
	}
	delete(files, ManifestName)
	if len(files) != len(declared) {
		return Snapshot{State: Modified, Fingerprint: fingerprint, Manifest: &manifest, Detail: "managed file set changed"}
	}
	bundleModes := map[string]os.FileMode{}
	for _, file := range bundle.Files {
		bundleModes[file.Path] = file.Mode.Perm()
	}
	for name, file := range files {
		if declared[name] != checksum(file.data) || bundleModes[name] == 0 || !modeMatches(file.mode, bundleModes[name]) {
			return Snapshot{State: Modified, Fingerprint: fingerprint, Manifest: &manifest, Detail: "managed file content changed"}
		}
	}
	comparison, err := CompareVersions(manifest.SkillVersion, bundle.Version)
	if err != nil {
		return Snapshot{State: InvalidManifest, Fingerprint: fingerprint, Manifest: &manifest, Detail: err.Error()}
	}
	if comparison > 0 {
		return Snapshot{State: Newer, Fingerprint: fingerprint, Manifest: &manifest}
	}
	if comparison < 0 || manifest.BundleChecksum != bundle.Checksum || !matchesBundle(manifest, bundle) {
		return Snapshot{State: Outdated, Fingerprint: fingerprint, Manifest: &manifest}
	}
	return Snapshot{State: Installed, Fingerprint: fingerprint, Manifest: &manifest}
}

func validateTarget(target Target) error {
	boundary, err := filepath.Abs(target.Boundary)
	if err != nil {
		return err
	}
	resolvedBoundary, err := filepath.EvalSymlinks(boundary)
	if err != nil {
		return fmt.Errorf("boundary is unavailable: %w", err)
	}
	info, err := os.Stat(resolvedBoundary)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("boundary is not a directory")
	}
	targetPath, err := filepath.Abs(target.Path)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(boundary, targetPath)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return fmt.Errorf("target escapes or equals its boundary")
	}
	current := boundary
	parts := strings.Split(rel, string(filepath.Separator))
	for _, part := range parts {
		current = filepath.Join(current, part)
		entry, err := os.Lstat(current)
		if os.IsNotExist(err) {
			break
		}
		if err != nil {
			return err
		}
		if isReparseOrSymlink(entry) {
			return fmt.Errorf("symlink in target path: %s", current)
		}
	}
	resolvedParent := filepath.Dir(targetPath)
	for {
		if _, err := os.Lstat(resolvedParent); err == nil {
			resolvedParent, err = filepath.EvalSymlinks(resolvedParent)
			if err != nil {
				return err
			}
			break
		}
		next := filepath.Dir(resolvedParent)
		if next == resolvedParent {
			return fmt.Errorf("target parent is unavailable")
		}
		resolvedParent = next
	}
	inside, err := filepath.Rel(resolvedBoundary, resolvedParent)
	if err != nil || inside == ".." || strings.HasPrefix(inside, ".."+string(filepath.Separator)) || filepath.IsAbs(inside) {
		return fmt.Errorf("resolved target parent escapes boundary")
	}
	return nil
}

type diskFile struct {
	data []byte
	mode os.FileMode
}

func scanTree(root string) (string, map[string]diskFile, bool, error) {
	h := sha256.New()
	files := map[string]diskFile{}
	unsafe := false
	err := filepath.WalkDir(root, func(name string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if name == root {
			return nil
		}
		rel, err := filepath.Rel(root, name)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		fmt.Fprintf(h, "%s\x00%s\x00%d\x00", rel, info.Mode().Type().String(), info.Mode().Perm())
		if isReparseOrSymlink(info) {
			unsafe = true
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		if !info.Mode().IsRegular() {
			unsafe = true
			return nil
		}
		data, err := os.ReadFile(name)
		if err != nil {
			return err
		}
		files[rel] = diskFile{data: data, mode: info.Mode()}
		h.Write(data)
		h.Write([]byte{0})
		return nil
	})
	return hex.EncodeToString(h.Sum(nil)), files, unsafe, err
}

func validateManifest(manifest Manifest, target Target) error {
	if manifest.SchemaVersion != 1 || manifest.ManagedBy != "toudocu" || manifest.SkillID != skills.SkillID || manifest.CLIVersion == "" || manifest.Agent != target.Agent || manifest.Scope != target.Scope || manifest.BundleChecksum == "" {
		return fmt.Errorf("manifest identity does not match target")
	}
	if _, err := parseVersion(manifest.SkillVersion); err != nil {
		return err
	}
	if _, err := parseVersion(manifest.CLIVersion); err != nil {
		return err
	}
	previous := ""
	for _, file := range manifest.Files {
		clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(file.Path)))
		if clean != file.Path || clean == "." || strings.HasPrefix(clean, "../") || filepath.IsAbs(filepath.FromSlash(file.Path)) || file.Path <= previous || len(file.SHA256) != 64 {
			return fmt.Errorf("manifest contains an invalid or unsorted file table")
		}
		if _, err := hex.DecodeString(file.SHA256); err != nil {
			return fmt.Errorf("manifest contains an invalid checksum")
		}
		previous = file.Path
	}
	return nil
}

func matchesBundle(manifest Manifest, bundle skills.Bundle) bool {
	if len(manifest.Files) != len(bundle.Files) {
		return false
	}
	for index, file := range bundle.Files {
		if manifest.Files[index].Path != file.Path || manifest.Files[index].SHA256 != checksum(file.Data) {
			return false
		}
	}
	return true
}

func checksum(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func CompareVersions(left, right string) (int, error) {
	a, err := parseVersion(left)
	if err != nil {
		return 0, err
	}
	b, err := parseVersion(right)
	if err != nil {
		return 0, err
	}
	for index := range a {
		if a[index] < b[index] {
			return -1, nil
		}
		if a[index] > b[index] {
			return 1, nil
		}
	}
	return 0, nil
}

func parseVersion(value string) ([3]int, error) {
	var result [3]int
	parts := strings.Split(value, ".")
	if len(parts) != 3 {
		return result, fmt.Errorf("invalid semantic version %q", value)
	}
	for index, part := range parts {
		if part == "" || (len(part) > 1 && part[0] == '0') {
			return result, fmt.Errorf("invalid semantic version %q", value)
		}
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return result, fmt.Errorf("invalid semantic version %q", value)
		}
		result[index] = number
	}
	return result, nil
}

func newManifest(bundle skills.Bundle, target Target, cliVersion string) Manifest {
	files := make([]FileChecksum, 0, len(bundle.Files))
	for _, file := range bundle.Files {
		files = append(files, FileChecksum{Path: file.Path, SHA256: checksum(file.Data)})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return Manifest{SchemaVersion: 1, ManagedBy: "toudocu", SkillID: bundle.ID, SkillVersion: bundle.Version, CLIVersion: cliVersion, Agent: target.Agent, Scope: target.Scope, BundleChecksum: bundle.Checksum, Files: files}
}
