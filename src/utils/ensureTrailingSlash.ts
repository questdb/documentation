import customFields from "../config/customFields.js"
import isInternalUrl from "@docusaurus/isInternalUrl"

const { domain } = customFields

export const ensureTrailingSlash = (url: string): string => {
  if (isInternalUrl(url) && !url.endsWith("/")) {
    const parsedUrl = new URL(url, `https://${domain}`)

    if (parsedUrl.pathname !== "/") {
      return `${url}/`
    }
  }
  return url
}
