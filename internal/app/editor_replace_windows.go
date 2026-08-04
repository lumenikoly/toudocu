//go:build windows

package docudocu

import (
	"syscall"
	"unsafe"
)

var moveFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW")

func replaceEditorFile(temporaryPath, targetPath string) error {
	from, err := syscall.UTF16PtrFromString(temporaryPath)
	if err != nil {
		return err
	}
	to, err := syscall.UTF16PtrFromString(targetPath)
	if err != nil {
		return err
	}
	const moveFileReplaceExisting = 0x1
	const moveFileWriteThrough = 0x8
	result, _, callErr := moveFileEx.Call(uintptr(unsafe.Pointer(from)), uintptr(unsafe.Pointer(to)), moveFileReplaceExisting|moveFileWriteThrough)
	if result == 0 {
		return callErr
	}
	return nil
}
