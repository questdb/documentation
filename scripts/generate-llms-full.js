const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const {
  convertAllComponents,
  bumpHeadings,
  normalizeNewLines,
  removeImports,
  processPartialImports,
} = require('../plugins/raw-markdown/convert-components')

const sidebarConfig = require('../documentation/sidebars.js')

const ROOT_DIR = path.resolve(__dirname, '..')
const DOCS_DIR = path.join(ROOT_DIR, 'documentation')
const OUTPUT_DIR = path.join(ROOT_DIR, 'static')
const BASE_URL = 'https://questdb.com/docs/'

function readDocFile(docId) {
  const mdPath = path.join(DOCS_DIR, docId + '.md')
  if (fs.existsSync(mdPath)) {
    return { raw: fs.readFileSync(mdPath, 'utf8'), filePath: mdPath }
  }
  const mdxPath = path.join(DOCS_DIR, docId + '.mdx')
  if (fs.existsSync(mdxPath)) {
    return { raw: fs.readFileSync(mdxPath, 'utf8'), filePath: mdxPath }
  }
  console.warn(`[generate-llms-full] Warning: File not found: ${mdPath} or ${mdxPath}`)
  return null
}

// Partial cache shared across all files
const partialCache = new Map()

function loadPartial(partialPath, currentFileDir) {
  // Unescape markdown escaped characters (like \_ -> _)
  const unescapedPath = partialPath.replace(/\\_/g, '_')
  const absolutePath = path.resolve(path.join(DOCS_DIR, currentFileDir), unescapedPath)

  if (partialCache.has(absolutePath)) {
    return partialCache.get(absolutePath)
  }

  if (fs.existsSync(absolutePath)) {
    const partialRaw = fs.readFileSync(absolutePath, 'utf8')
    const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/
    const match = partialRaw.match(frontmatterRegex)
    const content = match ? match[1] : partialRaw
    partialCache.set(absolutePath, content)
    return content
  }

  console.warn(`[generate-llms-full] Warning: Partial not found: ${absolutePath}`)
  return `<!-- Partial not found: ${partialPath} -->`
}

function normalizeUrl(url) {
  const clean = url.endsWith('/') ? url.slice(0, -1) : url
  return clean + '.md'
}

function generateUrl(docId, slug) {
  if (slug) {
    let urlPath = slug

    // Absolute slug (starts with /)
    if (urlPath.startsWith('/')) {
      urlPath = urlPath.substring(1)
      if (urlPath === '') {
        return BASE_URL + 'index.md'
      }
      return normalizeUrl(BASE_URL + urlPath)
    }

    // Relative slug - resolve it relative to the document's directory
    const docDir = path.dirname(docId)
    if (docDir && docDir !== '.') {
      urlPath = path.join(docDir, urlPath)
    }

    return normalizeUrl(BASE_URL + urlPath)
  }

  if (docId === 'introduction') {
    return BASE_URL + 'index.md'
  }
  // Strip /index suffix to match raw-markdown plugin output (e.g. cookbook/index -> cookbook.md)
  const urlDocId = docId.endsWith('/index') ? docId.slice(0, -'/index'.length) : docId
  return normalizeUrl(BASE_URL + urlDocId)
}

async function renderDoc(docId) {
  const doc = readDocFile(docId)
  if (!doc) return ''

  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = doc.raw.match(frontmatterRegex)

  let frontmatter = {}
  let mainContent = doc.raw

  if (match) {
    try {
      frontmatter = yaml.load(match[1]) || {}
    } catch (_) {}
    mainContent = match[2]
  }

  // Process partial component imports
  const relativeDir = path.relative(DOCS_DIR, path.dirname(doc.filePath))
  let processedContent = processPartialImports(mainContent, loadPartial, relativeDir)

  // Convert MDX components to markdown
  processedContent = await convertAllComponents(processedContent, path.dirname(doc.filePath), DOCS_DIR)

  processedContent = removeImports(processedContent)
  processedContent = normalizeNewLines(processedContent)

  // Body headings H2 -> H3 etc. so the manually emitted H2 title stays the top of each doc
  processedContent = bumpHeadings(processedContent, 1)

  const title = frontmatter.title || docId
  const url = generateUrl(docId, frontmatter.slug || null)

  let out = `## ${title}\n\n`
  out += `Source: ${url}\n\n`
  if (frontmatter.description) {
    out += `${frontmatter.description}\n\n`
  }
  out += processedContent.trim() + '\n\n'
  return out
}

// Walk the sidebar in order, collecting doc ids grouped by top-level category.
// Loose top-level docs fall under "Getting Started", matching llms.txt.
function collectSections(items) {
  const sections = []
  let current = { label: 'Getting Started', docIds: [] }

  function collectDocIds(subItems, into) {
    for (const item of subItems) {
      if (typeof item === 'string') {
        into.push(item)
      } else if (item.type === 'doc') {
        into.push(item.id)
      } else if (item.type === 'category' && item.items) {
        collectDocIds(item.items, into)
      }
      // item.type === 'link' is external; skip
    }
  }

  for (const item of items) {
    if (typeof item === 'string') {
      current.docIds.push(item)
    } else if (item.type === 'doc') {
      current.docIds.push(item.id)
    } else if (item.type === 'category') {
      if (current.docIds.length > 0) {
        sections.push(current)
      }
      current = { label: item.label, docIds: [] }
      if (item.items) {
        collectDocIds(item.items, current.docIds)
      }
    }
  }

  if (current.docIds.length > 0) {
    sections.push(current)
  }

  return sections
}

async function generateLlmsFull() {
  console.log('Generating llms-full.txt from QuestDB documentation...')

  const sections = collectSections(sidebarConfig.docs)

  let output = `# QuestDB Documentation — Full Content

Complete text of the QuestDB documentation as a single document, in the same
order as the index at ${BASE_URL}llms.txt. Each entry links its canonical
markdown source.

`

  let docCount = 0
  for (const section of sections) {
    output += `# ${section.label}\n\n`
    for (const docId of section.docIds) {
      output += await renderDoc(docId)
      docCount++
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  const targetPath = path.join(OUTPUT_DIR, 'llms-full.txt')
  fs.writeFileSync(targetPath, output)

  const sizeMB = (Buffer.byteLength(output, 'utf8') / 1024 / 1024).toFixed(2)
  console.log('✅ llms-full.txt generated successfully!')
  console.log(`   - Path: ${targetPath}`)
  console.log(`   - Docs: ${docCount}`)
  console.log(`   - Size: ${sizeMB} MB`)
}

generateLlmsFull().catch(error => {
  console.error('Error generating llms-full.txt:', error)
  process.exitCode = 1
})
