// Shared sidebar helpers for the llms.txt / llms-full.txt generators.

// True if docId appears anywhere in the given sidebar items subtree
// (as a string entry, a doc entry, or a category's own link doc).
function subtreeContainsDoc(items, docId) {
  if (!items) return false
  return items.some(item =>
    (typeof item === 'string' && item === docId) ||
    (item.type === 'doc' && item.id === docId) ||
    (item.type === 'category' &&
      ((item.link && item.link.type === 'doc' && item.link.id === docId) ||
        subtreeContainsDoc(item.items, docId)))
  )
}

module.exports = { subtreeContainsDoc }
