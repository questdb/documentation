import clsx from "clsx"
import React from "react"
import styles from "./styles.module.css"
import Link from "@docusaurus/Link"
import { ensureTrailingSlash } from "../../../utils"

export type Props = {
  categories: Array<{ title: string; description: string; url: string }>
  activeCategory?: string
}

export const Categories = ({ activeCategory = "", categories }: Props) => (
  <div className={styles.root}>
    {categories.map(({ title, url }) => {
      const urlWithTrailingSlash = ensureTrailingSlash(url)
      const active =
        ensureTrailingSlash(activeCategory) === urlWithTrailingSlash

      return (
        <Link
          to={ensureTrailingSlash(url)}
          key={url}
          className={clsx(styles.category, {
            [styles.active]: active,
          })}
        >
          <h3 className={styles.title}>{title}</h3>
        </Link>
      )
    })}
  </div>
)
