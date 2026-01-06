import React from "react"
import { Section } from "../../components/Section"
import type { CustomerLogo } from "../../assets/types"
import { logos } from "../../assets/logos"
import Link from "@docusaurus/Link"

import styles from "./styles.module.css"
import SvgImage from "../../components/SvgImage"

// SVGs are imported here to keep them in the bundle to avoid additional HTTP requests
import PostgresLogo from "../../../static/images/logos/pg.svg"
import GrafanaLogo from "../../../static/images/logos/grafana.svg"
import KafkaLogo from "../../../static/images/logos/kafka.svg"
import PythonLogo from "../../../static/images/logos/python_grayscale.svg"
import PandasLogo from "../../../static/images/logos/pandas.svg"
import TelegrafLogo from "../../../static/images/logos/influxdata.svg"
import ApacheSparkLogo from "../../../static/images/logos/apache-spark_grayscale.svg"
import ApacheSupersetLogo from "../../../static/images/logos/apache-superset_grayscale.svg"
import MindsDBLogo from "../../../static/images/logos/mindsdb.svg"
import CubeLogo from "../../../static/images/logos/cube.svg"
import RedpandaLogo from "../../../static/images/logos/redpanda_grayscale.svg"
import DatabentoLogo from "../../../static/images/logos/databento.svg"

const integrations: Array<{
  label: string
  logo: CustomerLogo & { svg: any }
  src?: string
}> = [
  {
    logo: { ...logos.redpanda, width: 90, svg: RedpandaLogo },
    label: "Redpanda",
    src: "/docs/ingestion/message-brokers/redpanda/",
  },
  {
    logo: { ...logos.postgres, svg: PostgresLogo },
    label: "Postgres",
    src: "/docs/query/pgwire/overview/",
  },
  {
    logo: { ...logos.grafana, svg: GrafanaLogo },
    label: "Grafana",
    src: "/docs/integrations/visualization/grafana/",
  },
  {
    logo: { ...logos.kafka, svg: KafkaLogo },
    label: "Kafka",
    src: "/docs/ingestion/message-brokers/kafka/",
  },
  {
    logo: { ...logos.python, svg: PythonLogo },
    label: "Python",
    src: "https://github.com/questdb/py-questdb-client",
  },
  {
    logo: { ...logos.pandas, svg: PandasLogo },
    label: "Pandas",
    src: "/docs/integrations/data-processing/pandas/",
  },
  {
    logo: { ...logos.apacheSuperset, width: 120, svg: ApacheSupersetLogo },
    label: "Superset",
    src: "/docs/integrations/visualization/superset/",
  },
  {
    logo: { ...logos.apacheSpark, width: 75, svg: ApacheSparkLogo },
    label: "Spark",
    src: "/docs/integrations/data-processing/spark/",
  },
  {
    logo: { ...logos.telegraf, svg: TelegrafLogo },
    label: "Telegraf",
    src: "/docs/ingestion/message-brokers/telegraf/",
  },
  {
    logo: { ...logos.mindsDB, svg: MindsDBLogo },
    label: "MindsDB",
    src: "/docs/integrations/other/mindsdb/",
  },
  {
    logo: { ...logos.cube, svg: CubeLogo },
    label: "Cube",
    src: "/docs/integrations/other/cube/",
  },
  {
    logo: { ...logos.databento, svg: DatabentoLogo },
    label: "Databento",
    src: "/docs/integrations/other/databento/",
  },
]

export const Integration = () => (
  <Section noGap>
    <Section.Title size="small" center>
      Use QuestDB with the tools you love
    </Section.Title>

    <div className={styles.integrations}>
      {integrations.map(({ label, logo, src }, index: number) => {
        const props = {
          key: index,
          className: styles.integration,
        }

        return React.createElement(
          typeof src === "string" ? Link : "div",
          {
            ...props,
            ...(typeof src === "string" ? { href: src } : {}),
          },

          <>
            <SvgImage
              title={logo.alt}
              image={React.createElement(logo.svg, {
                className: styles.logo,
                alt: logo.alt,
                width: logo.width ?? 50,
                height: logo.height ?? 50,
                loading: "lazy",
              })}
            />
            {label}
          </>,
        )
      })}
    </div>
  </Section>
)
