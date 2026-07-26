const path = require('path')

const BASE_URL = 'https://questdb.com/docs/'

// Canonical raw-markdown URL for a doc, shared by the llms.txt and
// llms-full.txt generators. Mirrors plugins/raw-markdown/index.js exactly —
// that plugin decides where the .md files are actually written, so any
// divergence here produces dead Source links.
function generateUrl(docId, slug) {
  let urlPath

  if (slug) {
    urlPath = slug
    if (urlPath.startsWith('/')) {
      urlPath = urlPath.substring(1)
    }
    // Only prepend the doc's directory if the slug doesn't already include
    // path segments (same rule as the raw-markdown plugin)
    const fileDir = path.dirname(docId)
    if (!urlPath.includes('/') && fileDir !== '.') {
      urlPath = path.join(fileDir, urlPath)
    }
  } else {
    // Safety net: introduction carries `slug: /`; if slug extraction ever
    // fails (parse error, unreadable file) fall back to the URL the plugin
    // publishes for it rather than emitting a dead introduction.md link.
    if (docId === 'introduction') {
      return BASE_URL + 'index.md'
    }
    urlPath = docId
    if (urlPath.endsWith('/index')) {
      urlPath = urlPath.replace(/\/index$/, '')
    }
  }
  // Note: a trailing '/' in a slug is deliberately NOT stripped — the
  // raw-markdown plugin writes `<slug>.md` verbatim, so stripping here
  // would link a path the plugin never publishes.

  if (urlPath === '' || urlPath === '.') {
    return BASE_URL + 'index.md'
  }
  return BASE_URL + urlPath + '.md'
}

module.exports = { BASE_URL, generateUrl }
