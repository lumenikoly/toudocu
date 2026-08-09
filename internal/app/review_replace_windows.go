//go:build windows

package docudocu

import (
	"syscall"
	"unsafe"
)

const (
	reviewMoveReplaceExisting = 0x00000001
	reviewMoveWriteThrough    = 0x00000008
)

var reviewMoveFileEx = reviewKernel32.NewProc("MoveFileExW")

func replaceReviewStateFile(source, destination string) error {
	sourcePointer, err := syscall.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	destinationPointer, err := syscall.UTF16PtrFromString(destination)
	if err != nil {
		return err
	}
	result, _, callErr := reviewMoveFileEx.Call(
		uintptr(unsafe.Pointer(sourcePointer)),
		uintptr(unsafe.Pointer(destinationPointer)),
		reviewMoveReplaceExisting|reviewMoveWriteThrough,
	)
	if result != 0 {
		return nil
	}
	if callErr != syscall.Errno(0) {
		return callErr
	}
	return syscall.EINVAL
}
