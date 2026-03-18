import React, { type ReactNode } from "react"
import clsx from "clsx"
import { ThemeClassNames } from "@docusaurus/theme-common"
import { useDoc } from "@docusaurus/plugin-content-docs/client"
import Heading from "@theme/Heading"
import MDXContent from "@theme/MDXContent"
import type { Props } from "@theme/DocItem/Content"
import CopyPageButton from "@theme/CopyPageButton"

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
  return (
    <div className={clsx(ThemeClassNames.docs.docMarkdown, "markdown")}>
      <header className={styles.header}>
        {syntheticTitle && <Heading as="h1">{syntheticTitle}</Heading>}
        <CopyPageButton />
      </header>
      <MDXContent>{children}</MDXContent>
    </div>
  )
}
