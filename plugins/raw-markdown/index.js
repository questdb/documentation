const fs = require("fs")
const path = require("path")
const matter = require("gray-matter")
const { convertAllComponents } = require("./convert-components")

module.exports = () => ({
  name: "raw-markdown",
  async postBuild({ outDir }) {
    const docsPath = path.join(__dirname, "../../documentation")
    const outputBase = outDir

    const partialCache = new Map()
    let fileCount = 0

    function loadPartial(partialPath, currentFileDir) {
      // Unescape markdown escaped characters (like \_ -> _)
      const unescapedPath = partialPath.replace(/\\_/g, "_")
      const absolutePath = path.resolve(path.join(docsPath, currentFileDir), unescapedPath)

      if (partialCache.has(absolutePath)) {
        return partialCache.get(absolutePath)
      }

      if (fs.existsSync(absolutePath)) {
        const partialContent = fs.readFileSync(absolutePath, "utf8")
        const { content } = matter(partialContent)
        partialCache.set(absolutePath, content)
        return content
      }

      console.warn(`[raw-markdown] Warning: Partial not found: ${absolutePath}`)
      return `<!-- Partial not found: ${partialPath} -->`
    }

    async function processDirectory(dir, relativeDir = "") {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const relativePath = path.join(relativeDir, entry.name)

        if (entry.isDirectory()) {
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "glossary") {
            continue
          }
          await processDirectory(fullPath, relativePath)
        } else if (entry.name.match(/\.mdx?$/) && !entry.name.includes(".partial.")) {
          const content = fs.readFileSync(fullPath, "utf8")
          const { data: frontmatter, content: markdownContent } = matter(content)

          let processedContent = ""

          if (frontmatter.title) {
            processedContent += `# ${frontmatter.title}\n\n`
          }

          if (frontmatter.description) {
            processedContent += `${frontmatter.description}\n\n`
          }

          processedContent += markdownContent

          // Extract import statements to build a map of component names to partial paths
          const importMap = new Map()
          // Match: import ComponentName from "path/to/file.partial.mdx"
          // Note: \s* allows for no space before 'from' (handles from" without space)
          const importRegex = /^import\s+(\w+)\s*\n?\s*from\s*['"](.+\.partial\.mdx?)['"];?\s*$/gm
          let match
          while ((match = importRegex.exec(processedContent)) !== null) {
            const componentName = match[1]
            const partialPath = match[2]
            importMap.set(componentName, partialPath)
          }

          // Replace partial component references with their content
          // Match <ComponentName /> or <ComponentName/>
          processedContent = processedContent.replace(/<(\w+)\s*\/>/g, (fullMatch, componentName) => {
            if (importMap.has(componentName)) {
              const partialPath = importMap.get(componentName)
              const currentFileDir = path.dirname(relativePath)
              const partialContent = loadPartial(partialPath, currentFileDir)
              // Add blank lines before and after the partial content
              return `\n\n${partialContent}\n\n`
            }
            // If not a partial, keep the component reference
            return fullMatch
          })

          // Convert MDX components to markdown equivalents
          processedContent = await convertAllComponents(processedContent, docsPath)

          // First handle single-line imports
          processedContent = processedContent.replace(/^import\s+.+\s+from\s+['"].+['"];?\s*$/gm, "")
          // Then handle multi-line imports (where line breaks exist)
          processedContent = processedContent.replace(/^import\s+[\s\S]*?\s+from\s*\n?\s*['"].+['"];?\s*$/gm, "")

          // Remove multiple consecutive blank lines (leave max 2)
          processedContent = processedContent.replace(/\n{3,}/g, "\n\n")

          processedContent = processedContent.trim() + "\n"

          let urlPath

          if (frontmatter.slug) {
            urlPath = frontmatter.slug
            if (urlPath.startsWith("/")) {
              urlPath = urlPath.substring(1)
            }
            // If slug is relative, resolve it relative to the file's directory
            if (!path.isAbsolute(urlPath)) {
              const fileDir = path.dirname(relativePath.replace(/\.mdx?$/, ""))
              // Only prepend directory if slug doesn't already include path segments
              if (!urlPath.includes("/") && fileDir !== ".") {
                urlPath = path.join(fileDir, urlPath)
              }
            }
          } else {
            urlPath = relativePath.replace(/\.mdx?$/, "")
            if (urlPath.endsWith("/index")) {
              urlPath = urlPath.replace(/\/index$/, "")
            }
          }

          if (urlPath === "" || urlPath === ".") {
            urlPath = ""
          }

          const outputFile = path.join(outputBase, urlPath, "index.md")
          const outputDir = path.dirname(outputFile)

          fs.mkdirSync(outputDir, { recursive: true })

          fs.writeFileSync(outputFile, processedContent, "utf8")
          fileCount++
        }
      }
    }

    await processDirectory(docsPath)
    console.log(`[raw-markdown] ✅ Generated ${fileCount} markdown files`)
  },
})