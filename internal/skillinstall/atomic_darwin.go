//go:build darwin

package skillinstall

import (
	"syscall"
	"unsafe"
)

func atomicPublish(stage, target string) error {
	oldPath, err := syscall.BytePtrFromString(stage)
	if err != nil {
		return err
	}
	newPath, err := syscall.BytePtrFromString(target)
	if err != nil {
		return err
	}
	atFDCWD := ^uintptr(1) // -2 on Darwin
	const (
		sysRenameatxNP = 488
		renameExcl     = 0x00000004
	)
	_, _, errno := syscall.Syscall6(sysRenameatxNP, atFDCWD, uintptr(unsafe.Pointer(oldPath)), atFDCWD, uintptr(unsafe.Pointer(newPath)), renameExcl, 0)
	if errno != 0 {
		return errno
	}
	return nil
}
