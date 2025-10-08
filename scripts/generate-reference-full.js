const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const {
  convertAllComponents,
  bumpHeadings,
  cleanForLLM,
  removeImports,
  processPartialImports,
  prependFrontmatter,
} = require('../plugins/raw-markdown/convert-components')

const ROOT_DIR = path.resolve(__dirname, '..')
const DOCS_DIR = path.join(ROOT_DIR, 'documentation')
const OUTPUT_DIR = path.join(ROOT_DIR, 'static')

const SECTIONS = [
  { base: 'reference', dir: 'function', label: 'Functions' },
  { base: 'reference', dir: 'operators', label: 'Operators' },
  { base: 'reference', dir: 'sql', label: 'SQL' },
  { base: 'concept', dir: '', label: 'Concept' }
]

function readFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8')
    }
  } catch (_) {
    console.warn(`[generate-reference-full] Warning: File not found: ${filePath}`)
  }
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
    // Strip frontmatter from partial
    const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/
    const match = partialRaw.match(frontmatterRegex)
    const content = match ? match[1] : partialRaw
    partialCache.set(absolutePath, content)
    return content
  }

  console.warn(`[generate-reference-full] Warning: Partial not found: ${absolutePath}`)
  return `<!-- Partial not found: ${partialPath} -->`
}

async function extractFrontmatterAndContent(raw, filePath) {
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

  // Prepend title and description (title will become H1, bumped to H2 later)
  let processedContent = prependFrontmatter(mainContent, frontmatter, true)

  // Process partial component imports
  const relativeDir = path.relative(DOCS_DIR, path.dirname(filePath))
  processedContent = processPartialImports(processedContent, loadPartial, relativeDir)

  // Convert MDX components to markdown
  const currentFileDir = path.dirname(filePath)
  const docsRoot = DOCS_DIR
  processedContent = await convertAllComponents(processedContent, currentFileDir, docsRoot)

  // Remove import statements
  processedContent = removeImports(processedContent)

  // Clean and normalize
  processedContent = cleanForLLM(processedContent)

  // Bump heading levels for proper hierarchy in combined document
  // H1 (title) becomes H2, H2 becomes H3, etc.
  const cleanContent = bumpHeadings(processedContent, 1)

  return {
    title: frontmatter.title || null,
    description: frontmatter.description || null,
    content: cleanContent
  }
}

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

async function buildSectionOutput(baseDir, sectionDir, sectionLabel) {
  const basePath = path.join(DOCS_DIR, baseDir)
  const targetDir = sectionDir ? path.join(basePath, sectionDir) : basePath
  if (!fs.existsSync(targetDir)) {
    return ''
  }

  const mdFiles = getAllMarkdownFilesRecursive(targetDir)
  if (mdFiles.length === 0) {
    return ''
  }

  let out = `\n# ${sectionLabel}\n\n`

  for (const filePath of mdFiles) {
    const raw = readFileIfExists(filePath)
    if (!raw) continue

    const { content } = await extractFrontmatterAndContent(raw, filePath)
    if (!content || !content.trim()) continue

    // Content already includes title (as H2 after bumping) and description
    // from prependFrontmatter + bumpHeadings in extractFrontmatterAndContent
    out += content + '\n\n'
  }

  return out
}

async function generateReferenceFull() {
  console.log('Generating reference-full.md from reference sections...')

  let output = ''

  for (const { base, dir, label } of SECTIONS) {
    output += await buildSectionOutput(base, dir, label)
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  const targetPath = path.join(OUTPUT_DIR, 'reference-full.md')
  fs.writeFileSync(targetPath, output.replace(/^\s+/, ''))

  const sizeKB = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(2)
  console.log('✅ reference-full.md generated successfully!')
  console.log(`   - Path: ${targetPath}`)
  console.log(`   - Size: ${sizeKB} KB`)
}

generateReferenceFull().catch(error => {
  console.error('Error generating reference-full.md:', error)
  process.exitCode = 1
})


