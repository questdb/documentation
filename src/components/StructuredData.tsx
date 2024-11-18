import React from "react"

type Props = {
  children: { [key: string]: string | object }
}

const base = {
  "@context": "https://schema.org",
}

export const StructuredData = ({ children }: Props) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify({ ...base, ...children }),
    }}
  />
)
