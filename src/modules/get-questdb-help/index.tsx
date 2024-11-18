import styles from "./styles.module.css"
import Link from "@docusaurus/Link"

type Props = {
  assets: any
  release: any
}

export const GetQuestdbHelp = ({ assets, release }: Props) => (
  <div className={styles.root}>
    <img
      alt="SQL statement in a code editor with an artistic view of the query result shown as a chart and a table"
      className={styles.illustration}
      height={468}
      src="/images/pages/getQuestdb/query.svg"
      width={500}
    />

    <div className={styles.text}>
      <h2 className={styles.title}>Lightweight and efficient</h2>
      <p>QuestDB is distributed as a single binary. You can download either:</p>
      <ul className={styles.list}>
        <li className={styles.bullet}>
          The &quot;rt&quot; version, this includes a trimmed JVM so you do not
          need anything else (~ {assets.linux.size})
        </li>
        <li className={styles.bullet}>
          The binary itself (~ {assets.noJre.size}), without the JVM. In this
          case, you need Java 17 installed locally
        </li>
      </ul>
      <p>
        Ready to go? Read our
        <Link to="/docs/"> documentation</Link> and start building.
      </p>
      <p>
        Check out the{" "}
        <a href={release.html_url} rel="noopener noreferrer" target="_blank">
          v{release.name} CHANGELOG
        </a>{" "}
        for information on the latest release.
      </p>
    </div>
  </div>
)
