import Button from "@theme/Button"
import { Section } from "../../components/Section"
import styles from "./styles.module.css"
import clsx from "clsx"
import btnCss from "../../css/index/button.module.css"

export const Header = () => {
  return (
    <Section fullWidth center>
      <div className={styles.titles}>
        <Section.Title level={1} className={styles.header}>
          Peak time-series performance database
        </Section.Title>

        <Section.Subtitle className={styles.subheader} center>
          QuestDB is the world's fastest growing open-source time-series
          database. It offers massive ingestion throughput, millisecond queries,
          powerful time-series SQL extensions, and scales well with minimal and
          maximal hardware. Save costs with better performance and efficiency.
        </Section.Subtitle>

        <Button
          className={clsx(btnCss.primary_cta)}
          to="/download/"
          newTab={false}
          variant="primary"
        >
          Download QuestDB
        </Button>
      </div>
    </Section>
  )
}
