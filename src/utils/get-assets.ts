export type Release = {
  assets: Array<{
    browser_download_url: string
    name: string
    size: number
  }>
  html_url: string
  name: string
  published_at: string
}

export type Asset = {
  href?: string
  size?: string
}

const formatSize = (size: number): string => `${(size / 1e6).toPrecision(3)} MB`

export const getAssets = ({
  assets,
}: Release): { linux: Asset; noJre: Asset; windows: Asset } => {
  const linuxRaw = assets.find(({ name }) => name.includes("linux"))
  const noJreRaw = assets.find(({ name }) => name.includes("no-jre"))
  const windowsRaw = assets.find(({ name }) => name.includes("win"))
  let linux = {}
  let noJre = {}
  let windows = {}

  if (linuxRaw != null) {
    linux = {
      href: linuxRaw.browser_download_url,
      size: formatSize(linuxRaw.size),
    }
  }

  if (noJreRaw != null) {
    noJre = {
      href: noJreRaw.browser_download_url,
      size: formatSize(noJreRaw.size),
    }
  }

  if (windowsRaw != null) {
    windows = {
      href: windowsRaw.browser_download_url,
      size: formatSize(windowsRaw.size),
    }
  }

  return { linux, noJre, windows }
}
