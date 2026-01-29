const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")
const matter = require("gray-matter")

const FEED_ITEMS_COUNT = 20
const GITHUB_REPO = "questdb/documentation"

/**
 * Get the last commit date for a file using GitHub API
 */
async function getGitHubLastModified(filePath, docsDir) {
  const relativePath = path.relative(path.dirname(docsDir), filePath).replace(/\\/g, "/")
  const url = `https://api.github.com/repos/${GITHUB_REPO}/commits?path=${encodeURIComponent(relativePath)}&per_page=1`

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "questdb-docs-rss"
      }
    })

    if (!response.ok) {
      return null
    }

    const commits = await response.json()
    if (commits && commits.length > 0 && commits[0].commit) {
      return new Date(commits[0].commit.committer.date)
    }
  } catch (err) {
    console.warn(`[docs-rss] GitHub API error for ${relativePath}:`, err.message)
  }

  return null
}

/**
 * Get the last git commit date for a file (local fallback)
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
async function generateFeedItems(docsDir, siteConfig, useGitHubApi) {
  const markdownFiles = getAllMarkdownFiles(docsDir)
  const items = []

  // Process files to get metadata (without dates yet)
  const fileData = []
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

      fileData.push({ filePath, title, url, excerpt })
    } catch (err) {
      console.warn(`[docs-rss] Error processing ${filePath}:`, err.message)
    }
  }

  // Get dates - use GitHub API or git log
  if (useGitHubApi) {
    console.log("[docs-rss] Using GitHub API for file dates...")
    // Fetch dates in parallel with concurrency limit
    const CONCURRENCY = 10
    for (let i = 0; i < fileData.length; i += CONCURRENCY) {
      const batch = fileData.slice(i, i + CONCURRENCY)
      const dates = await Promise.all(
        batch.map(f => getGitHubLastModified(f.filePath, docsDir))
      )
      batch.forEach((f, idx) => {
        f.date = dates[idx]
      })
    }
  } else {
    console.log("[docs-rss] Using local git for file dates...")
    for (const f of fileData) {
      f.date = getGitLastModified(f.filePath)
    }
  }

  // Filter out files without dates and build final items
  for (const f of fileData) {
    if (f.date) {
      items.push({
        title: f.title,
        url: f.url,
        date: f.date,
        excerpt: f.excerpt,
      })
    }
  }

  // Sort by date descending and take top N
  items.sort((a, b) => b.date - a.date)
  return items.slice(0, FEED_ITEMS_COUNT)
}

/**
 * Detect if we're in a shallow git clone
 */
function isShallowClone() {
  try {
    const result = execSync("git rev-parse --is-shallow-repository", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim()
    return result === "true"
  } catch {
    return false
  }
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

      // Use GitHub API if in shallow clone (e.g., Netlify)
      const useGitHubApi = isShallowClone()
      if (useGitHubApi) {
        console.log("[docs-rss] Shallow clone detected, using GitHub API")
      }

      const recentItems = await generateFeedItems(docsDir, siteConfig, useGitHubApi)
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
