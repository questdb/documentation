import React, { type ReactNode } from "react"
import clsx from "clsx"
import Head from "@docusaurus/Head"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import { ThemeClassNames } from "@docusaurus/theme-common"
import { useDoc } from "@docusaurus/plugin-content-docs/client"
import Heading from "@theme/Heading"
import MDXContent from "@theme/MDXContent"
import type { Props } from "@theme/DocItem/Content"
import CopyPageButton from "@theme/CopyPageButton"
import { getMarkdownUrl } from "../../../utils/markdown-url"

import styles from "./styles.module.css"

function useSyntheticTitle(): string | null {
  const { metadata, frontMatter, contentTitle } = useDoc()
  const shouldRender =
    !frontMatter.hide_title && typeof contentTitle === "undefined"
  if (!shouldRender) {
    return null
  }
  return metadata.title
}

export default function DocItemContent({ children }: Props): ReactNode {
  const syntheticTitle = useSyntheticTitle()
  const { metadata } = useDoc()
  const { siteConfig } = useDocusaurusContext()
  const markdownUrl = getMarkdownUrl(metadata.permalink, siteConfig.baseUrl)
  return (
    <div className={clsx(ThemeClassNames.docs.docMarkdown, "markdown")}>
      <Head>
        <link rel="alternate" type="text/markdown" href={markdownUrl} />
      </Head>
      <header className={styles.header}>
        {syntheticTitle && <Heading as="h1">{syntheticTitle}</Heading>}
        <CopyPageButton />
      </header>
      <MDXContent>{children}</MDXContent>
    </div>
  )
}
