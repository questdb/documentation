import React, { useEffect, useState } from "react"
import Button from "@theme/Button"

const Grafana = ({ src }) => {
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    setRendered(true)
  }, [])

  if (!rendered) {
    return null
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
    >
      <iframe src={src} width="100%" height="300" frameBorder="0" />
      <Button href={src} variant="plain" size="xxsmall" uppercase={false}>
        Open in new window
      </Button>
    </div>
  )
}

export default Grafana
