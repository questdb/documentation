const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const sidebarConfig = require('../documentation/sidebars.js')
const BASE_URL = 'https://questdb.com/docs/'

const processedFiles = new Map()

function extractFrontmatter(filePath) {
  if (processedFiles.has(filePath)) {
    return processedFiles.get(filePath)
  }

  try {
    let content

    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8')
    } else {
      const mdxPath = filePath.replace('.md', '.mdx')
      if (fs.existsSync(mdxPath)) {
        content = fs.readFileSync(mdxPath, 'utf8')
      } else {
        throw new Error(`File not found: ${filePath} or ${mdxPath}`)
      }
    }

    // Only extract frontmatter, ignore content
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/
    const match = content.match(frontmatterRegex)

    let frontmatter = {}

    if (match) {
      frontmatter = yaml.load(match[1]) || {}
    }

    const result = {
      title: frontmatter.title || null,
      description: frontmatter.description || null,
      slug: frontmatter.slug || null,
    }

    processedFiles.set(filePath, result)
    return result

  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}: ${error.message}`)
    const result = { title: null, description: null, slug: null }
    processedFiles.set(filePath, result)
    return result
  }
}

function normalizeUrl(url) {
  return url.endsWith("/") ? url : url + "/"
}

function generateUrl(docId, docPath) {
  // Extract frontmatter to check for custom slug
  const { slug } = extractFrontmatter(docPath)

  if (slug) {
    let urlPath = slug

    // Absolute slug (starts with /)
    if (urlPath.startsWith('/')) {
      urlPath = urlPath.substring(1)
      if (urlPath === '') {
        return normalizeUrl(BASE_URL)
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

  // Default behavior: use docId
  if (docId === 'introduction') {
    return normalizeUrl(BASE_URL)
  }
  return normalizeUrl(BASE_URL + docId)
}

function processForLlmsTxt(items, indent = 0, isTopLevel = false) {
  let result = ''
  const indentStr = '  '.repeat(indent)
  
  for (const item of items) {
    if (typeof item === 'string') {
      const docPath = path.join('./documentation', item + '.md')
      const { title, description } = extractFrontmatter(docPath)
      const url = generateUrl(item, docPath)

      const displayTitle = title || item
      result += `${indentStr}- [${displayTitle}](${url})`
      if (description) {
        result += `: ${description}`
      }
      result += '\n'

    } else if (item.type === 'doc') {
      const docId = item.id
      const docPath = path.join('./documentation', docId + '.md')
      const { title, description } = extractFrontmatter(docPath)
      const url = generateUrl(docId, docPath)

      const displayTitle = item.label || title || docId
      result += `${indentStr}- [${displayTitle}](${url})`
      if (description) {
        result += `: ${description}`
      }
      result += '\n'
      
    } else if (item.type === 'category') {
      if (isTopLevel) {
        result += `\n## ${item.label}\n`
        if (item.items && item.items.length > 0) {
          result += processForLlmsTxt(item.items, 0, false)
        }
      } else {
        result += `${indentStr}${item.label}\n`
        if (item.items && item.items.length > 0) {
          result += processForLlmsTxt(item.items, indent + 1, false)
        }
      }
      
    } else if (item.type === 'link') {
      const linkText = item.label || item.href
      result += `${indentStr}- [${linkText}](${item.href})\n`
    }
  }
  
  return result
}


function generateLlmsFiles() {
  console.log('Generating llms.txt from QuestDB documentation...')

  const docs = sidebarConfig.docs

  let llmsOutput = `# QuestDB Documentation

## Getting Started

`
  llmsOutput += processForLlmsTxt(docs, 0, true)

  fs.writeFileSync('./static/llms.txt', llmsOutput)

  console.log('✅ llms.txt generated successfully!')
  console.log(`   - Size: ${(llmsOutput.length / 1024).toFixed(2)} KB`)
}

try {
  generateLlmsFiles()
} catch (error) {
  console.error('Error generating llms files:', error)
}