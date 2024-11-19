import React from "react"

export type Col = {
  title: string
  width?: React.CSSProperties["width"]
}

export type Row = {
  title: string
  description?: string
  values: string[]
}
