import clsx from "clsx"
import React, { ReactNode } from "react"

import styles from "./styles.module.css"

type Props = {
  alt: string
  children?: ReactNode
  height?: number
  src: string
  width?: number
}

const Banner = ({ alt, children, height, src, width }: Props) => (
  <figure>
    <img
      alt={alt}
      className={clsx(styles.image, {
        [styles["image--title"]]: children != null,
      })}
      height={height}
      src={src}
      width={width}
      loading="lazy"
    />
    {children != null && (
      <figcaption className={styles.caption}>{children}</figcaption>
    )}
  </figure>
)

export default Banner
