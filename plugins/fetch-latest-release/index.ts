import type { Plugin } from '@docusaurus/types'
import nodeFetch from 'node-fetch'

export type Release = {
  name: string
  html_url?: string
}

export async function fetchLatestRelease(): Promise<Release | null> {
  if (typeof fetch === 'undefined') {
    try {
      const response = await nodeFetch('https://github-api.questdb.io/github/latest', {
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        console.error(`GitHub API error: ${response.status}`)
        return null
      }
      
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to fetch latest release:', error)
      return null
    }
  }

  // Browser environment with native fetch
  try {
    const response = await fetch('https://github-api.questdb.io/github/latest', {
      next: { revalidate: 3600 },
    })
    
    if (!response.ok) {
      console.error(`GitHub API error: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Failed to fetch latest release:', error)
    return null
  }
}

export default function plugin(): Plugin {
  return {
    name: 'fetch-latest-release',
    async loadContent() {
      return fetchLatestRelease()
    },
    async contentLoaded({ content, actions }) {
      const { setGlobalData } = actions
      setGlobalData({ latestRelease: content })
    },
  }
}