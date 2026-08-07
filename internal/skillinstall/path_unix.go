//go:build !windows

package skillinstall

import "os"

func isReparseOrSymlink(info os.FileInfo) bool {
	return info.Mode()&os.ModeSymlink != 0
}

func modeMatches(actual, expected os.FileMode) bool {
	return actual.Perm() == expected.Perm()
}
