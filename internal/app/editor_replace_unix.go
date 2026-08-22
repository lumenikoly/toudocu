//go:build !windows

package toudocu

import (
	"os"
	"path/filepath"
)

func replaceEditorFile(temporaryPath, targetPath string) error {
	if err := os.Rename(temporaryPath, targetPath); err != nil {
		return err
	}
	directory, err := os.Open(filepath.Dir(targetPath))
	if err != nil {
		return err
	}
	defer func() { _ = directory.Close() }()
	return directory.Sync()
}
