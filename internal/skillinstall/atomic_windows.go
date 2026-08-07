//go:build windows

package skillinstall

import (
	"syscall"
	"unsafe"
)

func atomicPublish(stage, target string) error {
	from, err := syscall.UTF16PtrFromString(stage)
	if err != nil {
		return err
	}
	to, err := syscall.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	moveFileEx := syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW")
	result, _, callErr := moveFileEx.Call(uintptr(unsafe.Pointer(from)), uintptr(unsafe.Pointer(to)), 0)
	if result == 0 {
		return callErr
	}
	return nil
}
