import React, { useState } from "react"
import prCss from "../../css/property.module.css"
import styles from "./styles.module.css"
import Button from "@theme/Button"

const tabs = {
  Simplicity: [
    "Query with SQL",
    "Deploy via Docker or binaries",
    "Interactive web console",
    "Postgres and InfluxDB line protocols",
    "Cloud-native or on-premises",
  ],

  Performance: [
    "High-throughput ingestion",
    "Optimized SQL queries",
    "Real-time streaming",
    "Lower infrastructure costs",
    "Less operational complexity",
  ],

  "Open Source": [
    "Apache License 2.0",
    "Thriving developer community",
    "Transparent development",
    "Popular open source integrations",
    "Embedded in Java applications",
  ],
}

export const FeatureTabs = () => {
  const [opened, setOpened] = useState("Simplicity")

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        {Object.keys(tabs).map((tab) => (
          <Button
            key={tab}
            className={styles.tab}
            onClick={() => setOpened(tab)}
            size="small"
            variant={opened === tab ? "primary" : "tertiary"}
          >
            {tab}
          </Button>
        ))}
      </div>

      <div className={styles.content}>
        {tabs[opened].map((feature: string) => (
          <p key={feature} className={prCss.property}>
            {feature}
          </p>
        ))}
      </div>

      <Button newTab={false} className={styles.cta} to="docs/#get-started">
        Get Started &gt;
      </Button>
    </div>
  )
}
