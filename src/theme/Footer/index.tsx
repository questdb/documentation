import customFields from "../../config/customFields"
import styles from "./styles.module.css"

type Props = {
  href?: string
  label: string
  to?: string
}

const Footer = () => {
  return (
    <footer className={styles.root}>
      <div className={styles.border}>
        <div className={styles.community}>
          <p className={styles.communityText}>
            Need a hand? Join our vibrant{" "}
            <a href={customFields.slackUrl} className={styles.communityLink}>
              public Slack
            </a>{" "}
            and{" "}
            <a href={customFields.discourseUrl} className={styles.communityLink}>
              Discourse forum
            </a>{" "}
            communities.
          </p>
        </div>
        <div className={styles.bottom}>
          <span>{customFields.copyright}</span>
          <div className={styles.rightLinks}>
            <a className={styles.link} href="/privacy-notice/">
              Privacy
            </a>
            <a className={styles.link} href="/terms/">
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
