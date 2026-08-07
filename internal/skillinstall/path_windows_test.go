//go:build windows

package skillinstall

import (
	"io/fs"
	"syscall"
	"testing"
	"time"
)

type windowsFileInfo struct{ attributes uint32 }

func (info windowsFileInfo) Name() string       { return "entry" }
func (info windowsFileInfo) Size() int64        { return 0 }
func (info windowsFileInfo) Mode() fs.FileMode  { return 0o644 }
func (info windowsFileInfo) ModTime() time.Time { return time.Time{} }
func (info windowsFileInfo) IsDir() bool        { return false }
func (info windowsFileInfo) Sys() any {
	return &syscall.Win32FileAttributeData{FileAttributes: info.attributes}
}

func TestWindowsReparsePointIsUnsafe(t *testing.T) {
	if !isReparseOrSymlink(windowsFileInfo{attributes: syscall.FILE_ATTRIBUTE_REPARSE_POINT}) {
		t.Fatal("Windows reparse point was accepted")
	}
}

func TestWindowsManagedFileMode(t *testing.T) {
	if !modeMatches(0o666, 0o644) || !modeMatches(0o666, 0o755) || modeMatches(0o444, 0o644) {
		t.Fatal("Windows writable/read-only mode semantics are incorrect")
	}
}
