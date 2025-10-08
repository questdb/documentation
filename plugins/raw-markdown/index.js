const fs = require("fs")
const path = require("path")
const matter = require("gray-matter")
const {
  convertAllComponents,
  removeImports,
  processPartialImports,
  prependFrontmatter,
  cleanForLLM,
} = require("./convert-components")

module.exports = () => ({
  name: "raw-markdown",
  async postBuild({ outDir, plugins }) {
    const docsPath = path.join(__dirname, "../../documentation")
    const outputBase = outDir

    // Get remote repo example data from plugin
    const remoteRepoPlugin = plugins.find(p => p.name === 'remote-repo-example')
    const repoExamples = remoteRepoPlugin?.content || {}

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

          // Prepend title and description from frontmatter
          let processedContent = prependFrontmatter(markdownContent, frontmatter, true)

          // Process partial component imports
          const currentFileRelativeDir = path.dirname(relativePath)
          processedContent = processPartialImports(processedContent, loadPartial, currentFileRelativeDir)

          // Convert MDX components to markdown equivalents
          const currentFileDir = path.join(docsPath, path.dirname(relativePath))
          processedContent = await convertAllComponents(processedContent, currentFileDir, docsPath, repoExamples)

          // Remove import statements
          processedContent = removeImports(processedContent)

          // Clean and normalize
          processedContent = cleanForLLM(processedContent) + "\n"

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