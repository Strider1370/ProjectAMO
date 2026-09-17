#!/usr/bin/env python3
"""Atomically exchange two same-filesystem paths using Linux renameat2."""

import ctypes
import errno
import os
import sys

AT_FDCWD = -100
RENAME_EXCHANGE = 0x2


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: atomic-exchange.py <first-path> <second-path>", file=sys.stderr)
        return 2

    first, second = (os.fsencode(arg) for arg in sys.argv[1:])
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        print("[build] libc renameat2 is unavailable", file=sys.stderr)
        return 1
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    if renameat2(AT_FDCWD, first, AT_FDCWD, second, RENAME_EXCHANGE) == 0:
        return 0

    error = ctypes.get_errno()
    print(f"[build] renameat2 exchange failed: {os.strerror(error)} (errno {error})", file=sys.stderr)
    if error in {errno.EXDEV, errno.ENOSYS, errno.EINVAL}:
        print("[build] paths must share a filesystem and the host must support renameat2", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
