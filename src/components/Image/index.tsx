import React, { CSSProperties } from "react"

import style from "./style.module.css"

type Props = {
  alt?: string
  width?: number
  height?: number
  src: string
  description?: React.ReactNode
  marginBottom?: CSSProperties["marginBottom"]
}

export const Image = ({
  width,
  height,
  src,
  description,
  alt,
  marginBottom = "4rem",
}: Props) => (
  <div className={style.root} style={{ marginBottom }}>
    <img
      alt={
        typeof description === "string" && typeof alt === "undefined"
          ? description
          : alt
      }
      className={style.img}
      src={src}
      width={width}
      height={height}
      loading="lazy"
    />

    {Boolean(description) && <p className={style.description}>{description}</p>}
  </div>
)
