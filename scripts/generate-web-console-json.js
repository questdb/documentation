const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const ROOT_DIR = path.resolve(__dirname, '..')
const DOCS_DIR = path.join(ROOT_DIR, 'documentation')
const OUTPUT_DIR = path.join(ROOT_DIR, 'static', 'web-console')
const BASE_URL = 'https://questdb.com/docs'

const DOCS_CATEGORIES = {
  functions: path.join(DOCS_DIR, 'reference', 'function'),
  operators: path.join(DOCS_DIR, 'reference', 'operators'),
  sql: path.join(DOCS_DIR, 'reference', 'sql'),
  concepts: path.join(DOCS_DIR, 'concept')
}

const SINGLE_FILE_CATEGORIES = {
  schema: [path.join(DOCS_DIR, 'guides', 'schema-design-essentials.md')]
}

/**
 * Read file if it exists
 */
function readFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8')
    }
  } catch (_) {
    console.warn(`[generate-web-console-json] Warning: File not found: ${filePath}`)
  }
  return null
}

/**
 * Extract frontmatter and content from markdown
 */
function extractFrontmatterAndContent(raw) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = raw.match(frontmatterRegex)

  let frontmatter = {}
  let mainContent = raw

  if (match) {
    try {
      frontmatter = yaml.load(match[1]) || {}
    } catch (_) {}
    mainContent = match[2]
  }

  return {
    title: frontmatter.title || null,
    slug: frontmatter.slug || null,
    content: mainContent
  }
}

/**
 * Extract headers (## and ###) from markdown content
 */
function extractHeaders(content) {
  const headers = []
  const lines = content.split('\n')

  for (const line of lines) {
    // Match ## headers (main function/operator names)
    const match = line.match(/^##\s+(.+)$/)
    if (match && !match[1].includes('Overview') && !match[1].includes('Example')) {
      headers.push(match[1].trim())
    }
  }

  return headers
}

/**
 * Generate URL for the documentation page
 */
function generateUrl(relativePath, slug) {
  if (slug) {
    // e.g., guides/schema-design-essentials.md with slug "schema-design-essentials"
    // -> guides/schema-design-essentials/index.md
    const dir = path.dirname(relativePath)
    const cleanSlug = slug.startsWith('/') ? slug.substring(1) : slug
    const urlPath = dir === '.' ? cleanSlug : `${dir}/${cleanSlug}`
    return `${BASE_URL}/${urlPath}/index.md`
  }

  // Default: convert path to URL
  // reference/function/aggregation.md -> reference/function/aggregation/index.md
  const urlPath = relativePath.replace(/\.md$/, '')
  return `${BASE_URL}/${urlPath}/index.md`
}

/**
 * Get all markdown files recursively
 */
function getAllMarkdownFilesRecursive(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...getAllMarkdownFilesRecursive(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }

  files.sort((a, b) => a.localeCompare(b))
  return files
}

/**
 * Process a single markdown file to extract metadata
 */
function processMarkdownFile(filePath, categoryPath) {
  const content = readFileIfExists(filePath)
  if (!content) return null

  const { title, slug, content: mainContent } = extractFrontmatterAndContent(content)
  const headers = extractHeaders(mainContent)

  // Get relative path from DOCS_DIR
  const relativePath = path.relative(DOCS_DIR, filePath)
  const url = generateUrl(relativePath, slug)

  return {
    path: relativePath,
    title: title || path.basename(filePath, '.md'),
    headers: headers,
    url: url
  }
}

/**
 * Process a category directory
 */
function processCategory(categoryPath) {
  if (!fs.existsSync(categoryPath)) {
    console.error(`Category directory not found: ${categoryPath}`)
    return []
  }

  const mdFiles = getAllMarkdownFilesRecursive(categoryPath)
  const results = []

  for (const filePath of mdFiles) {
    const metadata = processMarkdownFile(filePath, categoryPath)
    if (metadata) {
      results.push(metadata)
    }
  }

  return results
}

/**
 * Process a list of specific files for a category
 */
function processSingleFiles(filePaths) {
  const results = []

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`)
      continue
    }

    const metadata = processMarkdownFile(filePath, DOCS_DIR)
    if (metadata) {
      results.push(metadata)
    }
  }

  return results
}

/**
 * Generate ToC list from all categories
 */
function generateTocList(allMetadata) {
  const tocList = {}

  for (const [category, metadata] of Object.entries(allMetadata)) {
    const items = new Set()

    metadata.forEach(file => {
      // Add document title
      items.add(file.title)

      // Add headers (prefixed with document title for context)
      file.headers.forEach(header => {
        items.add(`${file.title} - ${header}`)
      })
    })

    tocList[category] = Array.from(items).sort()
  }

  return tocList
}

/**
 * Main function
 */
function generateWebConsoleJson() {
  console.log('Generating web console JSON files...')

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  const allMetadata = {}

  // Process each directory category
  for (const [category, categoryPath] of Object.entries(DOCS_CATEGORIES)) {
    console.log(`Processing ${category}...`)
    const metadata = processCategory(categoryPath)
    allMetadata[category] = metadata

    // Write category JSON file
    const outputFile = path.join(OUTPUT_DIR, `${category}-docs.json`)
    fs.writeFileSync(outputFile, JSON.stringify(metadata, null, 2), 'utf-8')
    console.log(`  ✓ Created ${outputFile} (${metadata.length} files)`)
  }

  // Process single file categories
  for (const [category, filePaths] of Object.entries(SINGLE_FILE_CATEGORIES)) {
    console.log(`Processing ${category}...`)
    const metadata = processSingleFiles(filePaths)
    allMetadata[category] = metadata

    // Write category JSON file
    const outputFile = path.join(OUTPUT_DIR, `${category}-docs.json`)
    fs.writeFileSync(outputFile, JSON.stringify(metadata, null, 2), 'utf-8')
    console.log(`  ✓ Created ${outputFile} (${metadata.length} files)`)
  }

  // Generate and write ToC list
  const tocList = generateTocList(allMetadata)
  const tocFile = path.join(OUTPUT_DIR, 'toc-list.json')
  fs.writeFileSync(tocFile, JSON.stringify(tocList, null, 2), 'utf-8')
  console.log(`  ✓ Created ${tocFile}`)

  console.log('\n✅ Web console JSON generation complete!')
}

try {
  generateWebConsoleJson()
} catch (error) {
  console.error('Error generating web console JSON:', error)
  process.exitCode = 1
}
