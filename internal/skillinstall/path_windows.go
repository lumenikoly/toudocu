//go:build windows

package skillinstall

import (
	"os"
	"syscall"
)

func isReparseOrSymlink(info os.FileInfo) bool {
	if info.Mode()&os.ModeSymlink != 0 {
		return true
	}
	data, ok := info.Sys().(*syscall.Win32FileAttributeData)
	return ok && data.FileAttributes&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0
}

func modeMatches(actual, _ os.FileMode) bool {
	// Windows does not represent POSIX execute bits and reports writable regular
	// files as 0666. A read-only transition is still a local modification.
	return actual.IsRegular() && actual.Perm()&0o222 != 0
}
