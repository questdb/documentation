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
    urlPath = docId
    if (urlPath.endsWith('/index')) {
      urlPath = urlPath.replace(/\/index$/, '')
    }
  }

  if (urlPath === '' || urlPath === '.') {
    return BASE_URL + 'index.md'
  }
  return BASE_URL + urlPath + '.md'
}

module.exports = { BASE_URL, generateUrl }
