//go:build !windows && !linux && !darwin

package skillinstall

import (
	"fmt"
	"os"
)

func atomicPublish(stage, target string) error {
	if _, err := os.Lstat(target); err == nil {
		return fmt.Errorf("target already exists")
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.Rename(stage, target)
}
