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
const { subtreeContainsDoc } = require('./lib/sidebar-utils')

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

  // Bump body headings by 2 (H1 -> H3, H2 -> H4, …) so nothing in a doc body
  // can collide with the H1 section headers or the H2 per-doc title below —
  // some docs (introduction, changelog) legitimately contain body H1s
  processedContent = bumpHeadings(processedContent, 2)

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

function docTitle(docId) {
  const doc = readDocFile(docId)
  if (!doc) return docId
  const { data } = matter(doc.raw)
  return data.title || docId
}

// Walk the sidebar in order, collecting doc ids grouped into sections.
// Top-level categories become sections labeled by the category. Loose
// top-level docs before the first category form an "Overview" section;
// loose docs appearing after a category (e.g. changelog) each get their own
// section labeled by the doc's title, so no doc is misattributed to a
// neighboring category. A category's own `link: {type: 'doc'}` page is
// included before its items unless the items already list it — the same
// rule (and therefore the same order) as the llms.txt generator.
function collectSections(items) {
  const sections = []
  const leading = { label: 'Overview', docIds: [] }
  let seenCategory = false

  function categoryLinkDocIds(item) {
    return item.link && item.link.type === 'doc' && item.link.id &&
      !subtreeContainsDoc(item.items, item.link.id)
      ? [item.link.id]
      : []
  }

  function collectDocIds(subItems, into) {
    for (const item of subItems) {
      if (typeof item === 'string') {
        into.push(item)
      } else if (item.type === 'doc') {
        into.push(item.id)
      } else if (item.type === 'category') {
        into.push(...categoryLinkDocIds(item))
        if (item.items) {
          collectDocIds(item.items, into)
        }
      }
      // item.type === 'link' is external; skip
    }
  }

  for (const item of items) {
    if (typeof item === 'string' || item.type === 'doc') {
      const docId = typeof item === 'string' ? item : item.id
      if (seenCategory) {
        sections.push({ label: docTitle(docId), docIds: [docId] })
      } else {
        leading.docIds.push(docId)
      }
    } else if (item.type === 'category') {
      if (!seenCategory && leading.docIds.length > 0) {
        sections.push(leading)
      }
      seenCategory = true
      const section = { label: item.label, docIds: [] }
      section.docIds.push(...categoryLinkDocIds(item))
      if (item.items) {
        collectDocIds(item.items, section.docIds)
      }
      sections.push(section)
    }
  }

  if (!seenCategory && leading.docIds.length > 0) {
    sections.push(leading)
  }

  return sections
}

// Same remote example data the raw-markdown plugin receives at build time,
// so <RemoteRepoExample /> renders real code instead of its fallback.
// Never fails the build: this data is only used for llms-full.txt, so on
// persistent fetch errors we degrade to placeholder examples for one build
// rather than blocking the whole docs deploy on a GitHub flake.
async function loadRepoExamples() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await remoteRepoExamplePlugin().loadContent()
    } catch (error) {
      console.warn(`[generate-llms-full] Warning: could not load remote repo examples (attempt ${attempt}/2): ${error.message}`)
    }
  }
  console.warn('[generate-llms-full] Proceeding without remote examples; <RemoteRepoExample /> blocks will render placeholders until the next successful build.')
  return {}
}

async function generateLlmsFull() {
  console.log('Generating llms-full.txt from QuestDB documentation...')

  const repoExamples = await loadRepoExamples()

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
    let body = ''
    for (const docId of section.docIds) {
      if (renderedDocIds.has(docId)) {
        duplicateCount++
        continue
      }
      renderedDocIds.add(docId)
      const rendered = await renderDoc(docId, repoExamples)
      if (rendered) {
        body += rendered
        docCount++
      }
    }
    // Skip the header if every doc in this section was a duplicate or missing
    if (body) {
      output += `# ${section.label}\n\n` + body
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
