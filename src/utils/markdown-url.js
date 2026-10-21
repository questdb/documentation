// Shared rule for translating a doc page URL to its `.md` companion.
// Used by:
//  - src/theme/CopyPageButton (runtime, via window.location.pathname)
//  - plugins/raw-markdown (build time, via siteConfig.baseUrl + urlPath)
// Plain JS (CommonJS) so the Docusaurus plugin can `require()` it directly;
// `allowJs: true` in tsconfig.json lets the TSX side import it with types.

function getMarkdownUrl(pathname, basePath) {
  const normalized = pathname.replace(/\/$/, "")
  const normalizedBase = (basePath || "").replace(/\/$/, "")
  return normalized === normalizedBase
    ? `${normalizedBase}/index.md`
    : `${normalized}.md`
}

module.exports = { getMarkdownUrl }
