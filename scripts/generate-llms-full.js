const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const {
  convertAllComponents,
  bumpHeadings,
  normalizeNewLines,
  removeImports,
  processPartialImports,
} = require('../plugins/raw-markdown/convert-components')
const remoteRepoExamplePlugin = require('../plugins/remote-repo-example/index')

const sidebarConfig = require('../documentation/sidebars.js')
const { BASE_URL, generateUrl } = require('./lib/docs-urls')

const ROOT_DIR = path.resolve(__dirname, '..')
const DOCS_DIR = path.join(ROOT_DIR, 'documentation')
const OUTPUT_DIR = path.join(ROOT_DIR, 'static')

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
    const { content } = matter(partialRaw)
    partialCache.set(absolutePath, content)
    return content
  }

  console.warn(`[generate-llms-full] Warning: Partial not found: ${absolutePath}`)
  return `<!-- Partial not found: ${partialPath} -->`
}

async function renderDoc(docId, repoExamples) {
  const doc = readDocFile(docId)
  if (!doc) return ''

  const { data: frontmatter, content: mainContent } = matter(doc.raw)

  // Process partial component imports
  const relativeDir = path.relative(DOCS_DIR, path.dirname(doc.filePath))
  let processedContent = processPartialImports(mainContent, loadPartial, relativeDir)

  // Convert MDX components to markdown
  processedContent = await convertAllComponents(
    processedContent,
    path.dirname(doc.filePath),
    DOCS_DIR,
    repoExamples,
  )

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
// A category's own `link: {type: 'doc'}` page is included before its items.
function collectSections(items) {
  const sections = []
  let current = { label: 'Getting Started', docIds: [] }

  function collectDocIds(subItems, into) {
    for (const item of subItems) {
      if (typeof item === 'string') {
        into.push(item)
      } else if (item.type === 'doc') {
        into.push(item.id)
      } else if (item.type === 'category') {
        if (item.link && item.link.type === 'doc' && item.link.id) {
          into.push(item.link.id)
        }
        if (item.items) {
          collectDocIds(item.items, into)
        }
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
      if (item.link && item.link.type === 'doc' && item.link.id) {
        current.docIds.push(item.link.id)
      }
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

  // Same remote example data the raw-markdown plugin receives at build time,
  // so <RemoteRepoExample /> renders real code instead of its fallback
  const repoExamples = await remoteRepoExamplePlugin().loadContent()

  const sections = collectSections(sidebarConfig.docs)

  let output = `# QuestDB Documentation — Full Content

Complete text of the QuestDB documentation as a single document, in the same
order as the index at ${BASE_URL}llms.txt. Each entry links its canonical
markdown source.

`

  // Docs can appear in several sidebar positions; render each only once
  const renderedDocIds = new Set()
  let docCount = 0
  let duplicateCount = 0

  for (const section of sections) {
    output += `# ${section.label}\n\n`
    for (const docId of section.docIds) {
      if (renderedDocIds.has(docId)) {
        duplicateCount++
        continue
      }
      renderedDocIds.add(docId)
      const rendered = await renderDoc(docId, repoExamples)
      if (rendered) {
        output += rendered
        docCount++
      }
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
  console.log(`   - Docs: ${docCount} (${duplicateCount} duplicate sidebar entries skipped)`)
  console.log(`   - Size: ${sizeMB} MB`)
}

generateLlmsFull().catch(error => {
  console.error('Error generating llms-full.txt:', error)
  process.exitCode = 1
})
