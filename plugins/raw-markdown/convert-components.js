const fs = require("fs")
const path = require("path")

/**
 * Parses JSX props from a string like: alt="test" height={300} src="..."
 * Returns an object with prop names as keys and values
 */
function parseProps(propsString) {
  const props = {}

  // Match: propName="value" or propName='value' or propName={value}
  const propRegex = /(\w+)=(?:{([^}]+)}|"([^"]*)"|'([^']*)')/g
  let match

  while ((match = propRegex.exec(propsString)) !== null) {
    const propName = match[1]
    const value = match[2] || match[3] || match[4] // Capture from {}, "", or ''
    props[propName] = value
  }

  return props
}

/**
 * Converts <Screenshot /> components to bold alt text
 * Example: <Screenshot alt="test" src="..." /> -> **test**
 */
function convertScreenshot(content) {
  const screenshotRegex = /<Screenshot\s+([^>]*?)(?:\/?>|>\s*<\/Screenshot>)/gs

  return content.replace(screenshotRegex, (match, propsString) => {
    const props = parseProps(propsString)
    if (props.alt) {
      return `\n\n**${props.alt}**\n\n`
    }
    return "\n\n**[Screenshot]**\n\n"
  })
}

/**
 * Converts <CodeBlock /> components to markdown code blocks
 */
function convertCodeBlock(content) {
  const codeBlockRegex = /<CodeBlock\s+([^>]*?)>([\s\S]*?)<\/CodeBlock>/g

  return content.replace(codeBlockRegex, (match, propsString, children) => {
    const props = parseProps(propsString)
    const language = props.language || ""
    const trimmedCode = children.trim()
    return `\n\n\`\`\`${language}\n${trimmedCode}\n\`\`\`\n\n`
  })
}

/**
 * Converts <DocButton /> components to markdown links
 */
function convertDocButton(content) {
  const docButtonRegex = /<DocButton\s+([^>]*?)>([\s\S]*?)<\/DocButton>/g

  return content.replace(docButtonRegex, (match, propsString, children) => {
    const props = parseProps(propsString)
    const href = props.href || props.to || "#"
    const text = children.trim()
    return `[${text}](${href})`
  })
}

/**
 * Converts <Tabs> and <TabItem> to markdown table
 */
function convertTabs(content) {
  const tabsRegex = /<Tabs\s+([\s\S]*?)>([\s\S]*?)<\/Tabs>/g

  return content.replace(tabsRegex, (match, propsString, children) => {
    // Extract values array from props (can span multiple lines)
    const valuesMatch = propsString.match(/values=\{(\[[\s\S]*?\])\}/s)
    if (!valuesMatch) {
      return match // Return original if can't parse
    }

    let valuesArray
    try {
      // Clean up the array string and parse it as JSON
      const valuesStr = valuesMatch[1]
        .replace(/'/g, '"') // Replace single quotes with double quotes
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas before } or ]
        .replace(/([\[{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys (only after [, {, or ,)
      valuesArray = JSON.parse(valuesStr)
    } catch (e) {
      console.warn("[convert-components] Failed to parse Tabs values:", e.message)
      return match
    }

    // Extract TabItem contents
    const tabItems = []
    const tabItemRegex = /<TabItem\s+value=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/TabItem>/g
    let tabMatch

    while ((tabMatch = tabItemRegex.exec(children)) !== null) {
      const value = tabMatch[1]
      const content = tabMatch[2].trim()
      tabItems.push({ value, content })
    }

    // Convert to sections with headings instead of table
    // This handles complex content better (nested tables, code blocks, etc.)
    let sections = "\n\n"

    for (const valueObj of valuesArray) {
      const label = valueObj.label || valueObj.value
      const tabItem = tabItems.find(item => item.value === valueObj.value)
      const content = tabItem ? tabItem.content.trim() : ""

      sections += `### ${label}\n\n${content}\n\n`
    }

    return sections
  })
}

/**
 * Converts <ConfigTable /> to markdown table
 * Reads config JSON and converts to table format
 */
function convertConfigTable(content, docsPath) {
  const importMap = new Map()
  const importRegex = /import\s+(\w+)\s+from\s+["']([^"']+)["']/g
  let importMatch

  while ((importMatch = importRegex.exec(content)) !== null) {
    const varName = importMatch[1]
    const importPath = importMatch[2]
    const unescapedPath = importPath.replace(/\\_/g, "_")
    importMap.set(varName, unescapedPath)
  }

  const configTableRegex = /<ConfigTable\s+([^>]*?)\/>/g

  return content.replace(configTableRegex, (match, propsString) => {
    const props = parseProps(propsString)

    // ConfigTable typically uses a rows prop pointing to JSON data
    if (props.rows) {
      try {
        // Get the import path for this variable
        const importPath = importMap.get(props.rows)
        if (importPath) {
          // Resolve the path relative to the markdown file's directory
          const configPath = path.join(docsPath, importPath)
          if (fs.existsSync(configPath)) {
            const configData = JSON.parse(fs.readFileSync(configPath, "utf8"))

            // Build table from config data
            let table = "\n\n| Property | Type | Description |\n|----------|------|-------------|\n"

            if (Array.isArray(configData)) {
              // Handle array format
              for (const item of configData) {
                const property = item.property || item.name || ""
                const type = item.type || ""
                const description = (item.description || "").replace(/\n/g, " ").replace(/\|/g, "\\|")
                table += `| ${property} | ${type} | ${description} |\n`
              }
            } else if (typeof configData === 'object') {
              // Handle object format where keys are property names
              for (const [property, config] of Object.entries(configData)) {
                const type = config.default || config.type || ""
                const description = (config.description || "").replace(/\n/g, " ").replace(/\|/g, "\\|")
                table += `| ${property} | ${type} | ${description} |\n`
              }
            }

            return table + "\n"
          }
        }
      } catch (e) {
        console.warn("[convert-components] Failed to read ConfigTable config:", e.message)
      }
    }

    return "\n\n**[Configuration Table]**\n\n"
  })
}

/**
 * Converts <InterpolateReleaseData /> to actual version number
 * Fetches latest release version once and caches it
 */
let cachedReleaseVersion = null

async function fetchReleaseVersion() {
  if (cachedReleaseVersion) {
    return cachedReleaseVersion
  }

  try {
    const https = require("https")

    return new Promise((resolve, reject) => {
      https.get("https://api.github.com/repos/questdb/questdb/releases/latest", {
        headers: { "User-Agent": "QuestDB-Docs" }
      }, (res) => {
        let data = ""

        res.on("data", chunk => { data += chunk })
        res.on("end", () => {
          try {
            const release = JSON.parse(data)
            cachedReleaseVersion = release.tag_name || "latest"
            resolve(cachedReleaseVersion)
          } catch (e) {
            resolve("latest")
          }
        })
      }).on("error", () => {
        resolve("latest")
      })
    })
  } catch (e) {
    return "latest"
  }
}

function convertInterpolateReleaseData(content, releaseVersion) {
  // Match <InterpolateReleaseData ... /> (self-closing)
  // Extract what renderText returns and replace {release.name} with version
  const interpolateRegex = /<InterpolateReleaseData[\s\S]*?\/>/g

  return content.replace(interpolateRegex, (match) => {
    // Extract everything inside renderText={(...) => ( ... )}
    // Match from the opening paren after => to the closing paren before )}
    const renderTextMatch = match.match(/renderText=\{[^(]*\([^)]*\)\s*=>\s*\(([\s\S]*?)\)\s*\}/);

    if (renderTextMatch) {
      // Extract the JSX content being returned
      let extracted = renderTextMatch[1].trim();

      // Replace ${release.name} with the actual version (note the $ before the {)
      extracted = extracted.replace(/\$\{release\.name\}/g, releaseVersion);
      extracted = extracted.replace(/\$\{release\.tag_name\}/g, releaseVersion);

      // Remove JSX template literal syntax: {`...`} becomes just the content
      extracted = extracted.replace(/\{`/g, '');
      extracted = extracted.replace(/`\}/g, '');

      return `\n\n${extracted}\n\n`;
    }

    // Fallback: just remove the component
    return '\n\n<!-- InterpolateReleaseData component removed -->\n\n'
  })
}

/**
 * Converts railroad diagram SVG references to raw railroad syntax
 * Example: ![alt](/images/docs/diagrams/refreshMatView.svg) -> railroad syntax code block
 */
function convertRailroadDiagrams(content, docsPath) {
  // Load the .railroad file once
  const railroadPath = path.join(docsPath, '../static/images/docs/diagrams/.railroad')

  if (!fs.existsSync(railroadPath)) {
    console.warn('[convert-components] Railroad file not found:', railroadPath)
    return content
  }

  let railroadContent = fs.readFileSync(railroadPath, 'utf8')

  const railroadMap = new Map()

  const normalized = railroadContent.replace(/\n{3,}/g, '\n\n')
  const blocks = normalized.split('\n\n')
  const definitions = blocks.filter(block => block.includes('::=') && !block.startsWith('#'))
  for (const definition of definitions) {
    const lines = definition.split('\n')

    if (lines.length === 0) continue

    const componentName = lines[0].trim()
    if (!componentName) continue

    const defLines = lines.slice(1)
    const defContent = defLines.join('\n')

    railroadMap.set(componentName, defContent)
  }

  // Replace SVG references with railroad syntax
  const diagramRegex = /!\[([^\]]*)\]\(\/images\/docs\/diagrams\/([^)]+)\.svg\)/g

  return content.replace(diagramRegex, (match, altText, diagramName) => {
    const definition = railroadMap.get(diagramName)

    if (definition) {
      return `\n\n\`\`\`railroad\n${definition}\n\`\`\`\n\n`
    }
    console.warn(`[convert-components] Railroad diagram not found in .railroad file: ${diagramName}`)

    // If not found, remove the image reference
    return '\n\n'
  })
}

/**
 * Converts <RemoteRepoExample /> to markdown code block with actual code
 * @param {string} content - The markdown content
 * @param {object} repoExamples - Repository examples data from remote-repo-example plugin
 */
function convertRemoteRepoExample(content, repoExamples = {}) {
  // Use [\s\S]*? to match across multiple lines
  const remoteRepoRegex = /<RemoteRepoExample\s+([\s\S]*?)\/>/g

  return content.replace(remoteRepoRegex, (match, propsString) => {
    const props = parseProps(propsString)
    const name = props.name || 'unknown'
    const lang = props.lang || 'text'
    const id = `${name}/${lang}`

    // Get the example from plugin data
    const example = repoExamples[id]

    if (!example || !example.code) {
      // Fallback if example not found
      return `\n\n\`\`\`${lang}\n// Code example: ${name} in ${lang}\n// (Example not found in repository data)\n\`\`\`\n\n`
    }

    // Build markdown output
    let output = '\n\n'

    // Add header if it exists and header prop is not false
    if (props.header !== 'false' && example.header) {
      output += `${example.header}\n\n`
    }

    // Add code block
    output += `\`\`\`${lang}\n${example.code}\n\`\`\`\n\n`

    return output
  })
}

/**
 * Converts <ILPClientsTable /> to markdown list with links
 */
const clients = [
  {
    label: "Python",
    docsUrl: "https://py-questdb-client.readthedocs.io/en/latest/",
    sourceUrl: "https://github.com/questdb/py-questdb-client",
  },
  {
    label: "NodeJS",
    docsUrl: "https://questdb.github.io/nodejs-questdb-client",
    sourceUrl: "https://github.com/questdb/nodejs-questdb-client",
  },
  {
    label: ".NET",
    sourceUrl: "https://github.com/questdb/net-questdb-client",
  },
  {
    label: "Java",
    docsUrl: "/docs/reference/clients/java_ilp/",
  },
  {
    label: "C",
    docsUrl: "https://github.com/questdb/c-questdb-client/blob/main/doc/C.md",
    sourceUrl: "https://github.com/questdb/c-questdb-client",
  },
  {
    label: "C++",
    docsUrl: "https://github.com/questdb/c-questdb-client/blob/main/doc/CPP.md",
    sourceUrl: "https://github.com/questdb/c-questdb-client",
  },
  {
    label: "Golang",
    docsUrl: "https://pkg.go.dev/github.com/questdb/go-questdb-client/",
    sourceUrl: "https://github.com/questdb/go-questdb-client/",
  },
  {
    label: "Rust",
    docsUrl: "https://docs.rs/crate/questdb-rs/latest",
    sourceUrl: "https://github.com/questdb/c-questdb-client",
  },
]
function convertILPClientsTable(content) {
  // Use [\s\S]*? to match across multiple lines
  const ilpClientsRegex = /<ILPClientsTable\s+([\s\S]*?)\/>/g

  return content.replace(ilpClientsRegex, (match, propsString) => {
    const props = parseProps(propsString)
    const language = props.language

    // Filter by language if specified
    const filteredClients = language
      ? clients.filter(c => c.label === language)
      : clients

    // Build markdown list
    let markdown = '\n\n'

    for (const client of filteredClients.sort((a, b) => a.label.localeCompare(b.label))) {
      markdown += `**${client.label} Client**\n\n`

      if (client.docsUrl) {
        markdown += `- [View full docs](${client.docsUrl})\n`
      }
      if (client.sourceUrl) {
        markdown += `- [View source code](${client.sourceUrl})\n`
      }

      markdown += '\n'
    }

    return markdown
  })
}

/**
 * Main function to convert all components in content
 * @param {string} content - The markdown content
 * @param {string} currentFileDir - Directory of the current file (for resolving imports)
 * @param {string} docsRoot - Root documentation directory (for railroad diagrams)
 * @param {object} repoExamples - Repository examples data (optional)
 */
async function convertAllComponents(content, currentFileDir, docsRoot, repoExamples = {}) {
  let processed = content

  // Get release version once
  const releaseVersion = await fetchReleaseVersion()

  // Convert components in order
  processed = convertInterpolateReleaseData(processed, releaseVersion)
  processed = convertRemoteRepoExample(processed, repoExamples)
  processed = convertILPClientsTable(processed)
  processed = convertScreenshot(processed)
  processed = convertDocButton(processed)
  processed = convertCodeBlock(processed)
  processed = convertTabs(processed)
  processed = convertConfigTable(processed, currentFileDir)
  processed = convertRailroadDiagrams(processed, docsRoot)

  return processed
}

/**
 * Bumps markdown heading levels outside of code blocks
 * @param {string} markdown - The markdown content
 * @param {number} bumpBy - Number of levels to increase (default: 1)
 * @returns {string} Markdown with adjusted heading levels
 */
function bumpHeadings(markdown, bumpBy = 1) {
  const lines = markdown.split('\n')
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  function isFence(line) {
    // Match 3+ consecutive backticks OR 3+ consecutive tildes (not mixed)
    const m = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
    if (!m) return null
    return { ticks: m[1], info: m[2] }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fenceMatch = isFence(line)
    if (fenceMatch) {
      if (!inFence) {
        inFence = true
        fenceChar = fenceMatch.ticks[0]
        fenceLen = fenceMatch.ticks.length
      } else if (fenceMatch.ticks[0] === fenceChar && fenceMatch.ticks.length >= fenceLen) {
        inFence = false
        fenceChar = ''
        fenceLen = 0
      }
      continue
    }

    if (inFence) continue

    // ATX heading outside code: optional leading spaces then 1-6 #'s and a space
    const headingMatch = line.match(/^(\s{0,3})(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const leading = headingMatch[1]
      const hashes = headingMatch[2]
      const text = headingMatch[3]
      const newLevel = Math.min(hashes.length + bumpBy, 6)
      lines[i] = `${leading}${'#'.repeat(newLevel)} ${text}`
    }
  }

  return lines.join('\n')
}

/**
 * Removes import statements from processed markdown
 * Handles both single-line and multi-line imports
 * @param {string} content - The markdown content
 * @returns {string} Content with imports removed
 */
function removeImports(content) {
  let processed = content
  // First handle single-line imports
  processed = processed.replace(/^import\s+.+\s+from\s+['"].+['"];?\s*$/gm, '')
  // Then handle multi-line imports (where line breaks exist)
  processed = processed.replace(/^import\s+[\s\S]*?\s+from\s*\n?\s*['"].+['"];?\s*$/gm, '')
  return processed
}

/**
 * Processes partial component imports
 * Extracts import statements and replaces component usage with actual content
 * @param {string} content - The markdown content
 * @param {Function} loadPartialFn - Function to load partial content: (partialPath, currentFileDir) => string
 * @param {string} currentFileDir - Relative directory of current file from docs root
 * @returns {string} Content with partials expanded
 */
function processPartialImports(content, loadPartialFn, currentFileDir) {
  // Extract import statements to build a map of component names to partial paths
  const importMap = new Map()
  // Match: import ComponentName from "path/to/file.partial.mdx"
  const importRegex = /^import\s+(\w+)\s*\n?\s*from\s*['"](.+\.partial\.mdx?)['"];?\s*$/gm
  let match
  while ((match = importRegex.exec(content)) !== null) {
    const componentName = match[1]
    const partialPath = match[2]
    importMap.set(componentName, partialPath)
  }

  // Replace partial component references with their content
  // Match <ComponentName /> or <ComponentName/>
  let processed = content.replace(/<(\w+)\s*\/>/g, (fullMatch, componentName) => {
    if (importMap.has(componentName)) {
      const partialPath = importMap.get(componentName)
      const partialContent = loadPartialFn(partialPath, currentFileDir)
      // Add blank lines before and after the partial content
      return `\n\n${partialContent}\n\n`
    }
    // If not a partial, keep the component reference
    return fullMatch
  })

  return processed
}

/**
 * Prepends frontmatter title and description to content
 * @param {string} content - The markdown content
 * @param {Object} frontmatter - Frontmatter object with title and description
 * @param {boolean} includeTitle - Whether to include title as H1 (default: true)
 * @returns {string} Content with title and description prepended
 */
function prependFrontmatter(content, frontmatter, includeTitle = true) {
  let processedContent = ''

  if (includeTitle && frontmatter.title) {
    processedContent += `# ${frontmatter.title}\n\n`
  }

  if (frontmatter.description) {
    processedContent += `${frontmatter.description}\n\n`
  }

  processedContent += content
  return processedContent
}

/**
 * Cleans processed markdown for final output
 * Normalizes whitespace
 * @param {string} content - The processed markdown content
 * @returns {string} Cleaned markdown
 */
function cleanForLLM(content) {
  return content
    .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
    .trim()
}

module.exports = {
  convertAllComponents,
  convertScreenshot,
  convertDocButton,
  convertCodeBlock,
  convertTabs,
  convertConfigTable,
  convertInterpolateReleaseData,
  fetchReleaseVersion,
  bumpHeadings,
  cleanForLLM,
  removeImports,
  processPartialImports,
  prependFrontmatter,
}
