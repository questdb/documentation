const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")
const matter = require("gray-matter")

const FEED_ITEMS_COUNT = 20

/**
 * Get the last git commit date for a file
 */
function getGitLastModified(filePath) {
  try {
    const timestamp = execSync(
      `git log -1 --format=%cI -- "${filePath}"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }
    ).trim()
    return timestamp ? new Date(timestamp) : null
  } catch {
    return null
  }
}

/**
 * Extract excerpt from markdown content
 */
function extractExcerpt(content, maxLength = 200) {
  let text = content
    .replace(/^import\s+.*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/^:::\w+[\s\S]*?^:::/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (text.length > maxLength) {
    text = text.substring(0, maxLength).replace(/\s+\S*$/, "") + "..."
  }

  return text
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  if (!str) return ""
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * Recursively get all markdown files
 */
function getAllMarkdownFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      getAllMarkdownFiles(fullPath, files)
    } else if (
      (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) &&
      !entry.name.includes(".partial.")
    ) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Generate RSS XML
 */
function generateRssXml(items, siteConfig) {
  const siteUrl = siteConfig.url + siteConfig.baseUrl
  const now = new Date().toUTCString()

  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid>${escapeXml(item.url)}</guid>
      <pubDate>${item.date.toUTCString()}</pubDate>
      <description>${escapeXml(item.excerpt)}</description>
    </item>`
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteConfig.title)} Documentation</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(siteConfig.tagline)}</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${escapeXml(siteUrl)}rss.xml" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`
}

/**
 * Generate RSS feed items from documentation
 */
function generateFeedItems(docsDir, siteConfig) {
  const markdownFiles = getAllMarkdownFiles(docsDir)
  const items = []

  for (const filePath of markdownFiles) {
    try {
      const fileContent = fs.readFileSync(filePath, "utf-8")
      const { data: frontmatter, content } = matter(fileContent)

      if (frontmatter.draft === true || frontmatter.changelog === false) {
        continue
      }

      let title = frontmatter.title
      if (!title) {
        const headingMatch = content.match(/^#\s+(.+)$/m)
        title = headingMatch ? headingMatch[1] : path.basename(filePath, path.extname(filePath))
      }

      const excerpt = frontmatter.description || extractExcerpt(content)
      const lastModified = getGitLastModified(filePath)

      if (!lastModified) {
        continue
      }

      const relativePath = path.relative(docsDir, filePath).replace(/\\/g, "/")
      const dirPath = path.dirname(relativePath)

      let urlPath
      if (frontmatter.slug) {
        if (frontmatter.slug.startsWith("/")) {
          urlPath = frontmatter.slug.slice(1)
        } else {
          urlPath = dirPath === "." ? frontmatter.slug : `${dirPath}/${frontmatter.slug}`
        }
      } else {
        urlPath = relativePath.replace(/\.mdx?$/, "").replace(/\/index$/, "")
      }

      if (urlPath && !urlPath.endsWith("/")) {
        urlPath += "/"
      }

      const baseUrl = siteConfig.baseUrl.endsWith("/")
        ? siteConfig.baseUrl
        : siteConfig.baseUrl + "/"
      const url = siteConfig.url + baseUrl + urlPath

      items.push({
        title,
        url,
        date: lastModified,
        excerpt,
      })
    } catch (err) {
      console.warn(`[docs-rss] Error processing ${filePath}:`, err.message)
    }
  }

  items.sort((a, b) => b.date - a.date)
  return items.slice(0, FEED_ITEMS_COUNT)
}

module.exports = function docsRssPlugin(context) {
  return {
    name: "docs-rss",

    async loadContent() {
      const { siteConfig } = context
      const docsDir = path.join(context.siteDir, "documentation")
      const staticDir = path.join(context.siteDir, "static")

      if (!fs.existsSync(docsDir)) {
        console.warn("[docs-rss] Documentation directory not found")
        return []
      }

      console.log("[docs-rss] Generating RSS feed...")

      const recentItems = generateFeedItems(docsDir, siteConfig)
      const rssXml = generateRssXml(recentItems, siteConfig)
      const rssPath = path.join(staticDir, "rss.xml")
      fs.writeFileSync(rssPath, rssXml, "utf-8")

      console.log(`[docs-rss] Generated RSS feed with ${recentItems.length} items`)

      return recentItems.map((item) => ({
        ...item,
        date: item.date.toISOString(),
      }))
    },

    async contentLoaded({ content, actions }) {
      const { setGlobalData } = actions
      setGlobalData({ changelog: content || [] })
    },
  }
}
