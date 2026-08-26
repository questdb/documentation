import { useEffect, useState } from "react"
import customFields from "../../config/customFields"
import styles from "./styles.module.css"

type Props = {
  href?: string
  label: string
  to?: string
}

const Footer = () => {
  const [cmpReady, setCmpReady] = useState(false)
  useEffect(() => {
    const check = () => {
      if ((window as unknown as { Cookiebot?: unknown }).Cookiebot) {
        setCmpReady(true)
      }
    }
    check()
    const events = ["CookiebotOnLoad", "CookiebotOnConsentReady"]
    events.forEach((event) => window.addEventListener(event, check))
    return () =>
      events.forEach((event) => window.removeEventListener(event, check))
  }, [])
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
            {cmpReady && (
              <button
                className={styles.linkButton}
                type="button"
                onClick={() =>
                  (window as unknown as { Cookiebot?: { renew?: () => void } })
                    .Cookiebot?.renew?.()
                }
              >
                Cookie settings
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
