// Token-provider examples require this version of both Java client artifacts.
const MINIMUM_JAVA_CLIENT_VERSION = "1.3.10"

/**
 * Resolve a stable release tag without falling below the documented API version.
 * @param {unknown} tag
 * @returns {string}
 */
function resolveJavaClientVersion(tag) {
  const version = typeof tag === "string" ? tag.replace(/^v/, "") : ""
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return MINIMUM_JAVA_CLIENT_VERSION
  }

  const parts = version.split(".").map(Number)
  const minimum = MINIMUM_JAVA_CLIENT_VERSION.split(".").map(Number)
  for (let i = 0; i < minimum.length; i++) {
    if (parts[i] > minimum[i]) {
      return version
    }
    if (parts[i] < minimum[i]) {
      return MINIMUM_JAVA_CLIENT_VERSION
    }
  }
  return version
}

module.exports = {
  MINIMUM_JAVA_CLIENT_VERSION,
  resolveJavaClientVersion,
}
