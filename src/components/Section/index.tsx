import React from "react"
import style from "./styles.module.css"
import clsx from "clsx"

import { Title } from "./Title"
import { Subtitle } from "./Subtitle"

type Props = {
  children: React.ReactNode
  odd?: boolean
  accent?: boolean
  row?: boolean
  fullWidth?: boolean
  noGap?: boolean
  center?: boolean
  className?: string
  noPadding?: boolean
  id?: string
  style?: React.CSSProperties
}

export const Section = ({
  fullWidth,
  children,
  odd,
  accent,
  row,
  noGap,
  noPadding,
  center,
  className = "",
  id,
  style: customStyle,
}: Props) => (
  <div
    className={clsx(
      style.root,
      {
        [style.odd]: odd,
        [style.accent]: accent,
        [style.row]: row,
        [style.fullWidth]: fullWidth,
        [style.noGap]: noGap,
        [style.center]: center,
        [style.noPadding]: noPadding,
      },
      className,
    )}
    id={id}
    style={customStyle}
  >
    {children}
  </div>
)

Section.Title = Title
Section.Subtitle = Subtitle
