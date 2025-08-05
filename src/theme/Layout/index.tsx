import { ReactNode } from "react"
import Head from "@docusaurus/Head"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import useBaseUrl from "@docusaurus/useBaseUrl"
import { useLocation } from "@docusaurus/router"

import Footer from "@theme/Footer"
import Navbar from "@theme/Navbar"
import ReleaseDropdown from "../../components/ReleaseDropdown"

import LayoutProviders from "@theme/Layout/Provider"
import { ensureTrailingSlash } from "../../utils"

export type Props = {
  noIndex?: boolean
  canonical?: string
  replaceTitle?: boolean
  children: ReactNode
  title?: string
  description?: string
  image?: string
  keywords?: string | string[]
  permalink?: string
  wrapperClassName?: string
  searchMetadatas?: {
    version?: string
    tag?: string
  }
}

const Layout = ({
  canonical,
  noIndex,
  children,
  description,
  image,
  keywords,
  permalink,
  title,
  wrapperClassName,
}: Props) => {
  const { siteConfig } = useDocusaurusContext()
  const location = useLocation()
  const {
    themeConfig: { image: defaultImage },
    url: siteUrl,
  } = siteConfig

  const metaTitle = title ?? ""

  const metaImage = image ?? defaultImage
  const metaImageUrl = useBaseUrl(metaImage, { absolute: true })

  const currentPagePath = location.pathname

  const canonicalUrl = `${siteUrl}${ensureTrailingSlash(
    permalink ?? canonical ?? currentPagePath,
  )}`

  const ogUrl = `${siteUrl}${ensureTrailingSlash(
    permalink ?? canonical ?? currentPagePath,
  )}`

  return (
    <LayoutProviders>
      <Head>
        {(noIndex ?? false) && <meta name="robots" content="noindex" />}
        <title>{metaTitle}</title>
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:image" content={metaImageUrl} />
        <meta property="og:url" content={ogUrl} />
        <meta property="og:title" content={metaTitle} />
        <meta name="twitter:image" content={metaImageUrl} />
        <meta name="description" content={description} />
        <meta property="og:description" content={description} />
        {keywords != null && keywords.length > 0 && (
          <meta
            name="keywords"
            content={keywords instanceof Array ? keywords.join(",") : keywords}
          />
        )}
        <meta
          name="google-site-verification"
          content="YltecND1MYGrcsaQnM7LGSYNdsMDyhEplsq5L_xn-pQ"
        />
      </Head>
      <Navbar />
      <div className={wrapperClassName}>{children}</div>
      <Footer />
    </LayoutProviders>
  )
}

export default Layout
