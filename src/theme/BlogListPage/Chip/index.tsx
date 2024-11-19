import clsx from "clsx"
import React from "react"
import styles from "./styles.module.css"
import Link from "@docusaurus/Link"

type Skin = "primary" | "secondary"
type Size = "small" | "medium" | "large"

type Props = {
  label: string
  permalink: string
  className?: string
  skin?: Skin
  size?: Size
  active?: boolean
}

const skins: { [key in Skin]: string } = {
  primary: styles.skinPrimary,
  secondary: styles.skinSecondary,
}

const sizes: { [key in Size]: string } = {
  small: styles.sizeSmall,
  medium: styles.sizeMedium,
  large: styles.sizeLarge,
}

export const Chip = ({
  label,
  permalink,
  className,
  skin = "primary",
  size = "medium",
  active,
}: Props) => (
  <Link
    className={clsx(styles.root, className, skins[skin], sizes[size], {
      [styles.active]: active,
    })}
    to={permalink}
  >
    {label}
  </Link>
)
