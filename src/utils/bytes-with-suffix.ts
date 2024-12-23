const suffixes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]

export const bytesWithSuffix = (
  /**
   * Number of bytes to convert
   */
  bytes: number,

  /**
   * The suffix to start from
   * @default 0
   */
  startFrom = 0,

  /**
   * The coefficient to use. 1024 for binary, 1000 for decimal
   * @default 1000
   * @see https://en.wikipedia.org/wiki/Binary_prefix
   * @see https://en.wikipedia.org/wiki/Decimal_prefix
   */
  coefficient = 1000,
): { value: number; suffix: string } => {
  if (bytes < coefficient) {
    return {
      value: bytes,
      suffix: suffixes[startFrom],
    }
  }

  return {
    value: bytes / coefficient,
    suffix: suffixes[startFrom + 1],
  }
}
