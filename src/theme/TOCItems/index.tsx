// Swizzled temporarily - required so nav does not require
// docusaurus hooks to function. Set padding via globalcss
// as an interim workaround.

import { useEffect, useMemo, useState } from "react"
import { useThemeConfig } from "@docusaurus/theme-common"
import {
  useFilteredAndTreeifiedTOC,
  type TOCHighlightConfig,
} from "@docusaurus/theme-common/internal"
import { useTOCHighlight } from "./useTOCHighlight"
import TOCItemTree from "@theme/TOCItems/Tree"
import type { Props } from "@theme/TOCItems"

function getNavbarHeight(): number {
  const navbar = document.querySelector(".navbar")
  return navbar ? navbar.clientHeight : 100
}

export default function TOCItems({
  toc,
  className = "table-of-contents table-of-contents__left-border",
  linkClassName = "table-of-contents__link",
  linkActiveClassName = undefined,
  minHeadingLevel: minHeadingLevelOption,
  maxHeadingLevel: maxHeadingLevelOption,
  ...props
}: Props): JSX.Element | null {
  const themeConfig = useThemeConfig()
  const [navbarHeight, setNavbarHeight] = useState<number>(70)

  // Check navbar height dynamically and update state
  useEffect(() => {
    const updateNavbarHeight = () => {
      setNavbarHeight(getNavbarHeight())
    }

    // Calculate on mount and when window resizes
    updateNavbarHeight()
    window.addEventListener("resize", updateNavbarHeight)

    return () => {
      window.removeEventListener("resize", updateNavbarHeight)
    }
  }, [])

  const minHeadingLevel =
    minHeadingLevelOption ?? themeConfig.tableOfContents.minHeadingLevel
  const maxHeadingLevel =
    maxHeadingLevelOption ?? themeConfig.tableOfContents.maxHeadingLevel

  const tocTree = useFilteredAndTreeifiedTOC({
    toc,
    minHeadingLevel,
    maxHeadingLevel,
  })

  const tocHighlightConfig: TOCHighlightConfig | undefined = useMemo(() => {
    if (linkClassName && linkActiveClassName) {
      return {
        linkClassName,
        linkActiveClassName,
        minHeadingLevel,
        maxHeadingLevel,
        // Add anchorTopOffset logic with fallback for dynamic navbar height
        anchorTopOffset: navbarHeight, // Dynamically updated navbar height
      }
    }
    return undefined
  }, [
    linkClassName,
    linkActiveClassName,
    minHeadingLevel,
    maxHeadingLevel,
    navbarHeight,
  ])

  useTOCHighlight(tocHighlightConfig)

  return (
    <TOCItemTree
      toc={tocTree}
      className={className}
      linkClassName={linkClassName}
      {...props}
    />
  )
}
