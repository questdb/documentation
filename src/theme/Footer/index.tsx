import useBaseUrl from "@docusaurus/useBaseUrl"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import Button from "@theme/Button"
import clsx from "clsx"
import Subscribe from "../../components/Subscribe"
import customFields from "../../config/customFields"
import styles from "./styles.module.css"

type Props = {
  href?: string
  label: string
  to?: string
}

const Link = ({ to, href, label, ...props }: Props) => {
  const linkHref = href ?? ""
  const linkTo = to ?? ""

  return (
    <a
      className={styles.link}
      style={{ textDecoration: "none" }}
      {...(href != null
        ? {
            href: linkHref,
            rel: "noopener noreferrer",
            target: "_blank",
          }
        : { href: linkTo })}
      {...props}
    >
      {label}
    </a>
  )
}

const Footer = () => {
  const {
    siteConfig: {
      themeConfig: {
        footer: { links },
      },
      tagline,
    },
  } = useDocusaurusContext()

  return (
    <footer className={styles.root}>
      <div className={clsx(styles.content, styles.center)}>
        <img
          alt="QuestDB logo"
          className={styles.logo}
          src="/images/footer/questdb.svg"
          title="QuestDB - Fastest open source database for time-series and analytics"
          width={108}
          height={27}
          loading="lazy"
        />

        <div className={styles.tagline}>
          <p className={styles.taglineText}>{tagline}</p>

          <div className={styles.subscribe}>
            <p className={styles.subscribeText}>
              Subscribe to our newsletter. Stay up to date with all things
              QuestDB.
            </p>

            <Subscribe
              className={styles.subscribeInputs}
              submitButtonVariant="tertiary"
              provider="newsletter"
              eventTag="newsletter_form_submitted_footer"
              renderSubmitButton={({ loading, defaultLoader }) => (
                <Button
                  variant="tertiary"
                  type="submit"
                  className={styles.subscribeSubmit}
                >
                  {loading ? defaultLoader : "Subscribe"}
                </Button>
              )}
            />
          </div>

          <Button
            className={styles.githubButton}
            href={customFields.githubUrl}
            icon={
              <img
                alt="GitHub logo"
                height={22}
                src="/images/github.svg"
                title="GitHub"
                width={22}
              />
            }
            size="xsmall"
            uppercase={false}
            variant="secondary"
          >
            Star us on GitHub
          </Button>
        </div>

        <div className={styles.links}>
          {links.map((linkItem, i) => (
            <div key={i} className={styles.category}>
              {Boolean(linkItem.title) && (
                <span className={styles.title}>{linkItem.title}</span>
              )}

              {linkItem.items?.length > 0 && (
                <ul className={styles.items}>
                  {linkItem.items.map((item) => (
                    <li className={styles.item} key={item.href ?? item.to}>
                      <Link {...item} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.border}>
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
