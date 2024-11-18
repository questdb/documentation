import React from "react"
import type { Props as BlogPostItemProps } from "@theme/BlogPostItem"
import { Chip } from "../Chip"
import styles from "./styles.module.css"
import type { FrontMatter } from "../"
import Link from "@docusaurus/Link"
import { ensureTrailingSlash } from "../../../utils"

type Props = {
  content: Omit<BlogPostItemProps, "children">
  forcedTag?: { label: string; permalink: string }
  belowFold: boolean
}

const ExternalChip = ({ permalink }) => {
  const externalUrl = new URL(permalink)
  return (
    <Chip
      className={styles.externalPost}
      label={`View on ${externalUrl.hostname}`.toUpperCase()}
      permalink={permalink}
      size="small"
      skin="secondary"
    />
  )
}

export const ListItem = ({ forcedTag, content, belowFold }: Props) => {
  const tag = forcedTag ?? content.metadata.tags[0] ?? {}
  const frontMatter: FrontMatter = content.frontMatter
  const isExternal = Boolean(frontMatter.permalink)
  const postUrl = isExternal
    ? frontMatter.permalink
    : ensureTrailingSlash(content.metadata.permalink)

  const thumbCandidate =
    content.frontMatter.image?.endsWith("banner.webp") ?? false
      ? `${
          content.frontMatter.image?.split("/").slice(0, -1).join("/") ?? ""
        }/banner.thumb.webp`
      : content.frontMatter.image

  const imageUrl = thumbCandidate ?? "/images/blog/placeholder.webp"
  const author =
    typeof content.frontMatter.author_url !== "undefined" ? (
      <a href={content.frontMatter.author_url}>{content.frontMatter.author}</a>
    ) : (
      content.frontMatter.author
    )

  const { date } = content.metadata

  // Calculate formattedDate based on the existing date
  const formattedDate =
    date && !isNaN(new Date(date).getTime())
      ? new Intl.DateTimeFormat("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date(date))
      : "Date not available"

  return (
    <div className={styles.root}>
      <div className={styles.imageBox}>
        <Link to={postUrl} className={styles.image}>
          <img
            loading={belowFold ? "lazy" : "eager"}
            src={imageUrl}
            alt={`Banner for blog post with title "${content.metadata.title}"`}
          />
        </Link>
        {isExternal && <ExternalChip permalink={postUrl} />}
      </div>

      <div className={styles.content}>
        <div className={styles.tags}>
          <Chip
            label={tag.label.toUpperCase()}
            permalink={tag.permalink}
            skin="secondary"
            size="small"
          />
        </div>

        <h2 className={styles.title}>
          <Link to={postUrl}>{content.metadata.title}</Link>
        </h2>
        <div className={styles.author}>
          by {author} on {formattedDate}
        </div>
      </div>
    </div>
  )
}
