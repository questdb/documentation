import React from "react"
import Button from "@theme/Button"

import styles from "./styles.module.css"

const DemoConsoleButton = ({ href }) => (
  <Button href={href} newTab className={styles.root}>
    Open this query in Web Console
  </Button>
)

export default DemoConsoleButton
