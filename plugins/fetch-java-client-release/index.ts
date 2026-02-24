import type { Plugin } from '@docusaurus/types'
import nodeFetch from 'node-fetch'

type Release = {
  name: string
}

const DEFAULT_RELEASE: Release = {
  name: '1.0.1',
}

async function fetchLatestJavaClientRelease(): Promise<Release> {
  const url =
    'https://api.github.com/repos/questdb/java-questdb-client/releases/latest'

  if (typeof fetch === 'undefined') {
    try {
      const response = await nodeFetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        console.error(`GitHub API error: ${response.status}`)
        return DEFAULT_RELEASE
      }

      const data = await response.json()
      const tagName = (data as { tag_name?: string }).tag_name ?? ''
      return { name: tagName.replace(/^v/, '') || DEFAULT_RELEASE.name }
    } catch (error) {
      console.error('Failed to fetch latest Java client release:', error)
      return DEFAULT_RELEASE
    }
  }

  // Browser environment with native fetch
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      console.error(`GitHub API error: ${response.status}`)
      return DEFAULT_RELEASE
    }

    const data = await response.json()
    const tagName = (data as { tag_name?: string }).tag_name ?? ''
    return { name: tagName.replace(/^v/, '') || DEFAULT_RELEASE.name }
  } catch (error) {
    console.error('Failed to fetch latest Java client release:', error)
    return DEFAULT_RELEASE
  }
}

export default function plugin(): Plugin {
  return {
    name: 'fetch-java-client-release',
    async loadContent() {
      return fetchLatestJavaClientRelease()
    },
    async contentLoaded({ content, actions }) {
      const { setGlobalData } = actions
      setGlobalData({ release: content })
    },
  }
}
