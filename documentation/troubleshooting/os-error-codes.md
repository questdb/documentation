---
title: List of OS error codes
sidebar_label: OS Error Codes
description:
  List of OS error codes that may be reported by QuestDB running on Linux and
  Windows.
---

The following document contains a partial list of Operating System (OS) error
codes that can be reported when running QuestDB and brief descriptions for them.

If instead you come across a QuestDB error code (e.g. `ER001`), refer to the [QuestDB Error Codes](/docs/troubleshooting/error-codes) page.

## Where to find error codes

QuestDB includes OS error codes into the `[<code>]` part of the exception
message written to the error logs:

```
io.questdb.cairo.CairoException: [24] could not open read-only [file=/root/.questdb/db/cpu/service.k]
```

The above message reports error code 24 which is "Too many open files" on Linux.

Some error log messages may also include `errno=<code>` key/value pair:

```
2022-02-01T13:40:10.636014Z E i.q.c.l.t.LineTcpConnectionContext [8655] could not process line data [table=test_table, msg=could not mmap  [size=248, offset=0, fd=1766, memUsed=314809894008, fileLen=8192], errno=12]
```

The above message reports error code 12 which is "Out of memory" on Linux.

## Linux error codes

| Error number | Error name      | Description                                      |
| ------------ | --------------- | ------------------------------------------------ |
| 1            | EPERM           | Operation not permitted.                         |
| 2            | ENOENT          | No such file or directory.                       |
| 3            | ESRCH           | No such process.                                 |
| 4            | EINTR           | Interrupted system call.                         |
| 5            | EIO             | I/O error.                                       |
| 6            | ENXIO           | No such device or address.                       |
| 7            | E2BIG           | Argument list too long.                          |
| 8            | ENOEXEC         | Exec format error.                               |
| 9            | EBADF           | Bad file number.                                 |
| 10           | ECHILD          | No child processes.                              |
| 11           | EAGAIN          | Try again.                                       |
| 12           | ENOMEM          | Out of memory.                                   |
| 13           | EACCES          | Permission denied.                               |
| 14           | EFAULT          | Bad address.                                     |
| 15           | ENOTBLK         | Block device required.                           |
| 16           | EBUSY           | Device or resource busy.                         |
| 17           | EEXIST          | File exists.                                     |
| 18           | EXDEV           | Cross-device link.                               |
| 19           | ENODEV          | No such device.                                  |
| 20           | ENOTDIR         | Not a directory.                                 |
| 21           | EISDIR          | Is a directory.                                  |
| 22           | EINVAL          | Invalid argument.                                |
| 23           | ENFILE          | File table overflow.                             |
| 24           | EMFILE          | Too many open files.                             |
| 25           | ENOTTY          | Not a typewriter.                                |
| 26           | ETXTBSY         | Text file busy.                                  |
| 27           | EFBIG           | File too large.                                  |
| 28           | ENOSPC          | No space left on device.                         |
| 29           | ESPIPE          | Illegal seek.                                    |
| 30           | EROFS           | Read-only file system.                           |
| 31           | EMLINK          | Too many links.                                  |
| 32           | EPIPE           | Broken pipe.                                     |
| 33           | EDOM            | Math argument out of domain of func.             |
| 34           | ERANGE          | Math result not representable.                   |
| 35           | EDEADLK         | Resource deadlock would occur.                   |
| 36           | ENAMETOOLONG    | File name too long.                              |
| 37           | ENOLCK          | No record locks available.                       |
| 38           | ENOSYS          | Function not implemented.                        |
| 39           | ENOTEMPTY       | Directory not empty.                             |
| 40           | ELOOP           | Too many symbolic links encountered.             |
| 42           | ENOMSG          | No message of desired type.                      |
| 43           | EIDRM           | Identifier removed.                              |
| 44           | ECHRNG          | Channel number out of range.                     |
| 45           | EL2NSYNC        | Level 2 not synchronized.                        |
| 46           | EL3HLT          | Level 3 halted.                                  |
| 47           | EL3RST          | Level 3 reset.                                   |
| 48           | ELNRNG          | Link number out of range.                        |
| 49           | EUNATCH         | Protocol driver not attached.                    |
| 50           | ENOCSI          | No CSI structure available.                      |
| 51           | EL2HLT          | Level 2 halted.                                  |
| 52           | EBADE           | Invalid exchange.                                |
| 53           | EBADR           | Invalid request descriptor.                      |
| 54           | EXFULL          | Exchange full.                                   |
| 55           | ENOANO          | No anode.                                        |
| 56           | EBADRQC         | Invalid request code.                            |
| 57           | EBADSLT         | Invalid slot.                                    |
| 59           | EBFONT          | Bad font file format.                            |
| 60           | ENOSTR          | Device not a stream.                             |
| 61           | ENODATA         | No data available.                               |
| 62           | ETIME           | Timer expired.                                   |
| 63           | ENOSR           | Out of streams resources.                        |
| 64           | ENONET          | Machine is not on the network.                   |
| 65           | ENOPKG          | Package not installed.                           |
| 66           | EREMOTE         | Object is remote.                                |
| 67           | ENOLINK         | Link has been severed.                           |
| 68           | EADV            | Advertise error.                                 |
| 69           | ESRMNT          | Srmount error.                                   |
| 70           | ECOMM           | Communication error on send.                     |
| 71           | EPROTO          | Protocol error.                                  |
| 72           | EMULTIHOP       | Multihop attempted.                              |
| 73           | EDOTDOT         | RFS specific error.                              |
| 74           | EBADMSG         | Not a data message.                              |
| 75           | EOVERFLOW       | Value too large for defined data type.           |
| 76           | ENOTUNIQ        | Name not unique on network.                      |
| 77           | EBADFD          | File descriptor in bad state.                    |
| 78           | EREMCHG         | Remote address changed.                          |
| 79           | ELIBACC         | Can not access a needed shared library.          |
| 80           | ELIBBAD         | Accessing a corrupted shared library.            |
| 81           | ELIBSCN         | .lib section in a.out corrupted.                 |
| 82           | ELIBMAX         | Attempting to link in too many shared libraries. |
| 83           | ELIBEXEC        | Cannot exec a shared library directly.           |
| 84           | EILSEQ          | Illegal byte sequence.                           |
| 85           | ERESTART        | Interrupted system call should be restarted.     |
| 86           | ESTRPIPE        | Streams pipe error.                              |
| 87           | EUSERS          | Too many users.                                  |
| 88           | ENOTSOCK        | Socket operation on non-socket.                  |
| 89           | EDESTADDRREQ    | Destination address required.                    |
| 90           | EMSGSIZE        | Message too long.                                |
| 91           | EPROTOTYPE      | Protocol wrong type for socket.                  |
| 92           | ENOPROTOOPT     | Protocol not available.                          |
| 93           | EPROTONOSUPPORT | Protocol not supported.                          |
| 94           | ESOCKTNOSUPPORT | Socket type not supported.                       |
| 95           | EOPNOTSUPP      | Operation not supported on transport endpoint.   |
| 96           | EPFNOSUPPORT    | Protocol family not supported.                   |
| 97           | EAFNOSUPPORT    | Address family not supported by protocol.        |
| 98           | EADDRINUSE      | Address already in use.                          |
| 99           | EADDRNOTAVAIL   | Cannot assign requested address.                 |
| 100          | ENETDOWN        | Network is down.                                 |
| 101          | ENETUNREACH     | Network is unreachable.                          |
| 102          | ENETRESET       | Network dropped connection because of reset.     |
| 103          | ECONNABORTED    | Software caused connection abort.                |
| 104          | ECONNRESET      | Connection reset by peer.                        |
| 105          | ENOBUFS         | No buffer space available.                       |
| 106          | EISCONN         | Transport endpoint is already connected.         |
| 107          | ENOTCONN        | Transport endpoint is not connected.             |
| 108          | ESHUTDOWN       | Cannot send after transport endpoint shutdown.   |
| 109          | ETOOMANYREFS    | Too many references: cannot splice.              |
| 110          | ETIMEDOUT       | Connection timed out.                            |
| 111          | ECONNREFUSED    | Connection refused.                              |
| 112          | EHOSTDOWN       | Host is down.                                    |
| 113          | EHOSTUNREACH    | No route to host.                                |
| 114          | EALREADY        | Operation already in progress.                   |
| 115          | EINPROGRESS     | Operation now in progress.                       |
| 116          | ESTALE          | Stale NFS file handle.                           |
| 117          | EUCLEAN         | Structure needs cleaning.                        |
| 118          | ENOTNAM         | Not a XENIX named type file.                     |
| 119          | ENAVAIL         | No XENIX semaphores available.                   |
| 120          | EISNAM          | Is a named type file.                            |
| 121          | EREMOTEIO       | Remote I/O error.                                |
| 122          | EDQUOT          | Quota exceeded.                                  |
| 123          | ENOMEDIUM       | No medium found.                                 |
| 124          | EMEDIUMTYPE     | Wrong medium type.                               |
| 125          | ECANCELED       | Operation Canceled.                              |
| 126          | ENOKEY          | Required key not available.                      |
| 127          | EKEYEXPIRED     | Key has expired.                                 |
| 128          | EKEYREVOKED     | Key has been revoked.                            |
| 129          | EKEYREJECTED    | Key was rejected by service.                     |
| 130          | EOWNERDEAD      | Owner died.                                      |
| 131          | ENOTRECOVERABLE | State not recoverable.                           |

## Windows error codes

A complete list of Windows error codes may be found
[here](https://docs.microsoft.com/en-us/windows/win32/debug/system-error-codes).

| Error number | Error name                    | Description                                                                                  |
| ------------ | ----------------------------- | -------------------------------------------------------------------------------------------- |
| 1            | ERROR_INVALID_FUNCTION        | Incorrect function.                                                                          |
| 2            | ERROR_FILE_NOT_FOUND          | The system cannot find the file specified.                                                   |
| 3            | ERROR_PATH_NOT_FOUND          | The system cannot find the path specified.                                                   |
| 4            | ERROR_TOO_MANY_OPEN_FILES     | The system cannot open the file.                                                             |
| 5            | ERROR_ACCESS_DENIED           | Access is denied.                                                                            |
| 6            | ERROR_INVALID_HANDLE          | The handle is invalid.                                                                       |
| 7            | ERROR_ARENA_TRASHED           | The storage control blocks were destroyed.                                                   |
| 8            | ERROR_NOT_ENOUGH_MEMORY       | Not enough memory is available to process this command.                                      |
| 9            | ERROR_INVALID_BLOCK           | The storage control block address is invalid.                                                |
| 10           | ERROR_BAD_ENVIRONMENT         | The environment is incorrect.                                                                |
| 11           | ERROR_BAD_FORMAT              | An attempt was made to load a program with an incorrect format.                              |
| 12           | ERROR_INVALID_ACCESS          | The access code is invalid.                                                                  |
| 13           | ERROR_INVALID_DATA            | The data is invalid.                                                                         |
| 14           | ERROR_OUTOFMEMORY             | Not enough storage is available to complete this operation.                                  |
| 15           | ERROR_INVALID_DRIVE           | The system cannot find the drive specified.                                                  |
| 16           | ERROR_CURRENT_DIRECTORY       | The directory cannot be removed.                                                             |
| 17           | ERROR_NOT_SAME_DEVICE         | The system cannot move the file to a different disk drive.                                   |
| 18           | ERROR_NO_MORE_FILES           | There are no more files.                                                                     |
| 19           | ERROR_WRITE_PROTECT           | The media is write protected.                                                                |
| 20           | ERROR_BAD_UNIT                | The system cannot find the device specified.                                                 |
| 21           | ERROR_NOT_READY               | The device is not ready.                                                                     |
| 22           | ERROR_BAD_COMMAND             | The device does not recognize the command.                                                   |
| 23           | ERROR_CRC                     | Data error (cyclic redundancy check).                                                        |
| 24           | ERROR_BAD_LENGTH              | The program issued a command but the command length is incorrect.                            |
| 25           | ERROR_SEEK                    | The drive cannot locate a specific area or track on the disk.                                |
| 26           | ERROR_NOT_DOS_DISK            | The specified disk or diskette cannot be accessed.                                           |
| 27           | ERROR_SECTOR_NOT_FOUND        | The drive cannot find the sector requested.                                                  |
| 28           | ERROR_OUT_OF_PAPER            | The printer is out of paper.                                                                 |
| 29           | ERROR_WRITE_FAULT             | The system cannot write to the specified device.                                             |
| 30           | ERROR_READ_FAULT              | The system cannot read from the specified device.                                            |
| 31           | ERROR_GEN_FAILURE             | A device attached to the system is not functioning.                                          |
| 32           | ERROR_SHARING_VIOLATION       | The process cannot access the file because it is being used by another process.              |
| 33           | ERROR_LOCK_VIOLATION          | The process cannot access the file because another process has locked a portion of the file. |
| 34           | ERROR_WRONG_DISK              | The wrong diskette is in the drive. Insert %2 (Volume Serial Number: %3) into drive %1.      |
| 36           | ERROR_SHARING_BUFFER_EXCEEDED | Too many files opened for sharing.                                                           |
| 38           | ERROR_HANDLE_EOF              | Reached the end of the file.                                                                 |
| 39           | ERROR_HANDLE_DISK_FULL        | The disk is full.                                                                            |
| 87           | ERROR_INVALID_PARAMETER       | The parameter is incorrect.                                                                  |
| 112          | ERROR_DISK_FULL               | The disk is full.                                                                            |
| 123          | ERROR_INVALID_NAME            | The file name, directory name, or volume label syntax is incorrect.                          |
| 1450         | ERROR_NO_SYSTEM_RESOURCES     | Insufficient system resources exist to complete the requested service.                       |

## MacOS error codes

| Error number | Error name      | Description                                     |
| ------------ | --------------- | ----------------------------------------------- |
| 0            | Base            | Undefined error: 0                              |
| 1            | EPERM           | Operation not permitted                         |
| 2            | ENOENT          | No such file or directory                       |
| 3            | ESRCH           | No such process                                 |
| 4            | EINTR           | Interrupted system call                         |
| 5            | EIO             | Input/output error                              |
| 6            | ENXIO           | Device not configured                           |
| 7            | E2BIG           | Argument list too long                          |
| 8            | ENOEXEC         | Exec format error                               |
| 9            | EBADF           | Bad file descriptor                             |
| 10           | ECHILD          | No child processes                              |
| 11           | EDEADLK         | Resource deadlock avoided                       |
| 12           | ENOMEM          | Cannot allocate memory                          |
| 13           | EACCES          | Permission denied                               |
| 14           | EFAULT          | Bad address                                     |
| 15           | ENOTBLK         | Block device required                           |
| 16           | EBUSY           | Device busy                                     |
| 17           | EEXIST          | File exists                                     |
| 18           | EXDEV           | Cross-device link                               |
| 19           | ENODEV          | Operation not supported by device               |
| 20           | ENOTDIR         | Not a directory                                 |
| 21           | EISDIR          | Is a directory                                  |
| 22           | EINVAL          | Invalid argument                                |
| 23           | ENFILE          | Too many open files in system                   |
| 24           | EMFILE          | Too many open files                             |
| 25           | ENOTTY          | Inappropriate ioctl for device                  |
| 26           | ETXTBSY         | Text file busy                                  |
| 27           | EFBIG           | File too large                                  |
| 28           | ENOSPC          | No space left on device                         |
| 29           | ESPIPE          | Illegal seek                                    |
| 30           | EROFS           | Read-only file system                           |
| 31           | EMLINK          | Too many links                                  |
| 32           | EPIPE           | Broken pipe                                     |
| 33           | EDOM            | Numerical argument out of domain                |
| 34           | ERANGE          | Result too large                                |
| 35           | EAGAIN          | Resource temporarily unavailable                |
| 36           | EINPROGRESS     | Operation now in progress                       |
| 37           | EALREADY        | Operation already in progress                   |
| 38           | ENOTSOCK        | Socket operation on non-socket                  |
| 39           | EDESTADDRREQ    | Destination address required                    |
| 40           | EMSGSIZE        | Message too long                                |
| 41           | EPROTOTYPE      | Protocol wrong type for socket                  |
| 42           | ENOPROTOOPT     | Protocol not available                          |
| 43           | EPROTONOSUPPORT | Protocol not supported                          |
| 44           | ESOCKTNOSUPPORT | Socket type not supported                       |
| 45           | ENOTSUP         | Operation not supported                         |
| 46           | EPFNOSUPPORT    | Protocol family not supported                   |
| 47           | EAFNOSUPPORT    | Address family not supported by protocol family |
| 48           | EADDRINUSE      | Address already in use                          |
| 49           | EADDRNOTAVAIL   | Can’t assign requested address                  |
| 50           | ENETDOWN        | Network is down                                 |
| 51           | ENETUNREACH     | Network is unreachable                          |
| 52           | ENETRESET       | Network dropped connection on reset             |
| 53           | ECONNABORTED    | Software caused connection abort                |
| 54           | ECONNRESET      | Connection reset by peer                        |
| 55           | ENOBUFS         | No buffer space available                       |
| 56           | EISCONN         | Socket is already connected                     |
| 57           | ENOTCONN        | Socket is not connected                         |
| 58           | ESHUTDOWN       | Can’t send after socket shutdown                |
| 59           | ETOOMANYREFS    | Too many references: can’t splice               |
| 60           | ETIMEDOUT       | Operation timed out                             |
| 61           | ECONNREFUSED    | Connection refused                              |
| 62           | ELOOP           | Too many levels of symbolic links               |
| 63           | ENAMETOOLONG    | File name too long                              |
| 64           | EHOSTDOWN       | Host is down                                    |
| 65           | EHOSTUNREACH    | No route to host                                |
| 66           | ENOTEMPTY       | Directory not empty                             |
| 67           | EPROCLIM        | Too many processes                              |
| 68           | EUSERS          | Too many users                                  |
| 69           | EDQUOT          | Disc quota exceeded                             |
| 70           | ESTALE          | Stale NFS file handle                           |
| 71           | EREMOTE         | Too many levels of remote in path               |
| 72           | EBADRPC         | RPC struct is bad                               |
| 73           | ERPCMISMATCH    | RPC version wrong                               |
| 74           | EPROGUNAVAIL    | RPC prog. not avail                             |
| 75           | EPROGMISMATCH   | Program version wrong                           |
| 76           | EPROCUNAVAIL    | Bad procedure for program                       |
| 77           | ENOLCK          | No locks available                              |
| 78           | ENOSYS          | Function not implemented                        |
| 79           | EFTYPE          | Inappropriate file type or format               |
| 80           | EAUTH           | Authentication error                            |
| 81           | ENEEDAUTH       | Need authenticator                              |
| 82           | EPWROFF         | Device power is off                             |
| 83           | EDEVERR         | Device error                                    |
| 84           | EOVERFLOW       | Value too large to be stored in data type       |
| 85           | EBADEXEC        | Bad executable                                  |
| 86           | EBADARCH        | Bad CPU type in executable                      |
| 87           | ESHLIBVERS      | Shared library version mismatch                 |
| 88           | EBADMACHO       | Malformed Macho file                            |
| 89           | ECANCELED       | Operation canceled                              |
| 90           | EIDRM           | Identifier removed                              |
| 91           | ENOMSG          | No message of desired type                      |
| 92           | EILSEQ          | Illegal byte sequence                           |
| 93           | ENOATTR         | Attribute not found                             |
| 94           | EBADMSG         | Bad message                                     |
| 95           | EMULTIHOP       | EMULTIHOP (Reserved)                            |
| 96           | ENODATA         | No message available on STREAM                  |
| 97           | ENOLINK         | ENOLINK (Reserved)                              |
| 98           | ENOSR           | No STREAM resources                             |
| 99           | ENOSTR          | Not a STREAM                                    |
| 100          | EPROTO          | Protocol error                                  |
| 101          | ETIME           | STREAM ioctl timeout                            |
| 102          | EOPNOTSUPP      | Operation not supported on socket               |
| 103          | ENOPOLICY       | Policy not found                                |
| 104          | ENOTRECOVERABLE | State not recoverable                           |
| 105          | EOWNERDEAD      | Previous owner died                             |
| 106          | EQFULL          | Interface output queue is full                  |
