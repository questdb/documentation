import React from "react"
import styles from "./styles.module.css"
import customFields from "../../config/customFields"
import clsx from "clsx"

import { Content, Arrow } from "../../components/Flyover"
import { FlyoverItem } from "./item"
import { Column } from "./types"

const columns: Column[] = [
  {
    title: "Compare DBs",
    sections: [
      {
        items: [
          { href: "/compare/influxdb/", label: "vs. InfluxDB" },
          {
            href: "/blog/timescaledb-vs-questdb-comparison",
            label: "vs. TimescaleDB",
          },
          {
            href: "/blog/mongodb-time-series-benchmark-review/",
            label: "vs. MongoDB",
          },
        ],
      },
    ],
  },
  {
    title: "Production ready",
    sections: [
      {
        items: [
          { href: "/use-cases/", label: "Use cases" },
          { href: "/customers/", label: "Success stories" },
        ],
      },
    ],
  },
  {
    title: "Live demos",
    sections: [
      {
        items: [
          {
            href: customFields.demoUrl,
            label: "SQL live demo",
            subtitle: "2BN+ rows",
            className: clsx(styles.highlight),
          },
          {
            href: "/dashboards/crypto/",
            label: "Live crypto trades",
            subtitle: "Powered by Grafana",
          },
        ],
      },
    ],
  },
]

export const CompareFlyover = React.forwardRef((_, ref) => {
  return (
    <Content className={styles.product} align="start" ref={ref}>
      <Arrow className={styles.arrow} />
      <div className={styles.sections}>
        {columns.map(({ title, sections }) => (
          <div className={styles.column} key={title}>
            <span className={styles.heading}>{title}</span>
            {sections.map(({ items, title: subtitle }, i) => (
              <React.Fragment key={`${subtitle}-${i}`}>
                {subtitle !== undefined && (
                  <small className={styles.heading}>{subtitle}</small>
                )}
                <div className={styles.section} key={i}>
                  <FlyoverItem key={`item-${i}`} items={items} />
                </div>
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </Content>
  )
})
