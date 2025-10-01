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
        .replace(/(\w+):/g, '"$1":') // Quote unquoted keys
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
  const configTableRegex = /<ConfigTable\s+([^>]*?)\/>/g

  return content.replace(configTableRegex, (match, propsString) => {
    const props = parseProps(propsString)

    // ConfigTable typically uses a config prop pointing to JSON data
    if (props.config) {
      try {
        // Try to resolve and read the config file
        const configPath = path.join(docsPath, props.config)
        if (fs.existsSync(configPath)) {
          const configData = JSON.parse(fs.readFileSync(configPath, "utf8"))

          // Build table from config data
          let table = "\n\n| Property | Type | Description |\n|----------|------|-------------|\n"

          if (Array.isArray(configData)) {
            for (const item of configData) {
              const property = item.property || item.name || ""
              const type = item.type || ""
              const description = (item.description || "").replace(/\n/g, " ")
              table += `| ${property} | ${type} | ${description} |\n`
            }
          }

          return table + "\n"
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

  const railroadContent = fs.readFileSync(railroadPath, 'utf8')

  // Parse railroad definitions into a map
  const railroadMap = new Map()
  const lines = railroadContent.split('\n')
  let currentName = null
  let currentDef = []

  for (const line of lines) {
    // Check if line is a definition name (doesn't start with whitespace and isn't empty/comment)
    if (line && !line.startsWith(' ') && !line.startsWith('#') && !line.startsWith('\t')) {
      // Save previous definition if exists
      if (currentName && currentDef.length > 0) {
        railroadMap.set(currentName, currentDef.join('\n'))
      }
      // Start new definition
      currentName = line.trim()
      currentDef = []
    } else if (currentName && line.trim()) {
      // Add to current definition
      currentDef.push(line)
    } else if (currentName && !line.trim() && currentDef.length > 0) {
      // Empty line marks end of definition
      railroadMap.set(currentName, currentDef.join('\n'))
      currentName = null
      currentDef = []
    }
  }

  // Save last definition
  if (currentName && currentDef.length > 0) {
    railroadMap.set(currentName, currentDef.join('\n'))
  }

  // Replace SVG references with railroad syntax
  const diagramRegex = /!\[([^\]]*)\]\(\/images\/docs\/diagrams\/([^)]+)\.svg\)/g

  return content.replace(diagramRegex, (match, altText, diagramName) => {
    const definition = railroadMap.get(diagramName)

    if (definition) {
      return `\n\n\`\`\`\n${definition}\n\`\`\`\n\n`
    }

    // If not found, remove the image reference
    return '\n\n'
  })
}

/**
 * Main function to convert all components in content
 */
async function convertAllComponents(content, docsPath) {
  let processed = content

  // Get release version once
  const releaseVersion = await fetchReleaseVersion()

  // Convert components in order
  processed = convertInterpolateReleaseData(processed, releaseVersion)
  processed = convertScreenshot(processed)
  processed = convertDocButton(processed)
  processed = convertCodeBlock(processed)
  processed = convertTabs(processed)
  processed = convertConfigTable(processed, docsPath)
  processed = convertRailroadDiagrams(processed, docsPath)

  return processed
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
}
