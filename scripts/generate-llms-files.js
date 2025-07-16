const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const sidebarConfig = require('../documentation/sidebars.js')
const BASE_URL = 'https://questdb.com/docs/'

const processedFiles = new Map()

function extractMetadataAndContent(filePath) {
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
    
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)
    
    let frontmatter = {}
    let mainContent = content
    
    if (match) {
      frontmatter = yaml.load(match[1]) || {}
      mainContent = match[2]
    }
    
    let cleanContent = mainContent
      // Remove import statements
      .replace(/^import\s+.*$/gm, '')
      // Remove self-closing components
      .replace(/<[A-Z][^>]*\/>/g, '')
      // Remove headers
      .replace(/^#{1,6}\s*(.*)$/gm, '$1')
      // Remove extra newlines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim()
    
    const result = {
      title: frontmatter.title || null,
      description: frontmatter.description || null,
      content: cleanContent
    }
    
    processedFiles.set(filePath, result)
    return result
    
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}: ${error.message}`)
    const result = { title: null, description: null, content: '' }
    processedFiles.set(filePath, result)
    return result
  }
}

function generateUrl(docId) {
  if (docId === 'introduction') {
    return BASE_URL
  }
  return BASE_URL + docId
}

function processForLlmsTxt(items, indent = 0, isTopLevel = false) {
  let result = ''
  const indentStr = '  '.repeat(indent)
  
  for (const item of items) {
    if (typeof item === 'string') {
      const docPath = path.join('./documentation', item + '.md')
      const { title, description } = extractMetadataAndContent(docPath)
      const url = generateUrl(item)
      
      const displayTitle = title || item
      result += `${indentStr}- [${displayTitle}](${url})`
      if (description) {
        result += `: ${description}`
      }
      result += '\n'
      
    } else if (item.type === 'doc') {
      const docId = item.id
      const docPath = path.join('./documentation', docId + '.md')
      const { title, description } = extractMetadataAndContent(docPath)
      const url = generateUrl(docId)
      
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

function processForLlmsFullTxt(items, headerLevel = 2, isTopLevel = false) {
  let result = ''
  const headerPrefix = '#'.repeat(headerLevel)
  
  for (const item of items) {
    if (typeof item === 'string') {
      const docPath = path.join('./documentation', item + '.md')
      const { title, description, content } = extractMetadataAndContent(docPath)
      
      if (content.trim()) {
        const displayTitle = title || item
        result += `\n${headerPrefix}# ${displayTitle}\n`
        if (description) {
          result += `**Description**: ${description}\n`
        }
        result += content + '\n\n'
      }
      
    } else if (item.type === 'doc') {
      const docId = item.id
      const docPath = path.join('./documentation', docId + '.md')
      const { title, description, content } = extractMetadataAndContent(docPath)
      
      if (content.trim()) {
        const displayTitle = item.label || title || docId
        
        if (isTopLevel) {
          result += `\n${headerPrefix} ${displayTitle}\n`
        } else {
          result += `\n${headerPrefix}# ${displayTitle}\n`
        }
        
        if (description) {
          result += `**Description**: ${description}\n`
        }
        result += '\n' + content + '\n\n'
      }
      
    } else if (item.type === 'category') {
      if (isTopLevel) {
        result += `\n## ${item.label}\n\n`
        if (item.items && item.items.length > 0) {
          result += processForLlmsFullTxt(item.items, 3, false)
        }
      } else {
        result += `\n${headerPrefix} ${item.label}\n\n`
        if (item.items && item.items.length > 0) {
          result += processForLlmsFullTxt(item.items, headerLevel + 1, false)
        }
      }
      
    }
  }
  
  return result
}

function generateLlmsFiles() {
  console.log('Generating llms.txt and llms-full.txt from QuestDB documentation...')
  
  const docs = sidebarConfig.docs
  
  let llmsOutput = `# QuestDB Documentation

## Getting Started

`
  llmsOutput += processForLlmsTxt(docs, 0, true)
  
  let llmsFullOutput = `# QuestDB Documentation - Complete Content

This file contains the complete text content of QuestDB documentation organized hierarchically.

## Getting Started

`
  llmsFullOutput += processForLlmsFullTxt(docs, 2, true)
  
  fs.writeFileSync('./static/llms.txt', llmsOutput)
  fs.writeFileSync('./static/llms-full.txt', llmsFullOutput)
  
  console.log('✅ llms.txt generated successfully!')
  console.log(`   - Size: ${(llmsOutput.length / 1024).toFixed(2)} KB`)
  
  console.log('✅ llms-full.txt generated successfully!')
  console.log(`   - Size: ${(llmsFullOutput.length / 1024 / 1024).toFixed(2)} MB`)
}

try {
  generateLlmsFiles()
} catch (error) {
  console.error('Error generating llms files:', error)
}