import { Section } from "../../components/Section"
import styles from "./styles.module.css"

type Highlight = {
  key: string
  title: string
  description: string
  image: string
  ctaLink?: string
}

interface HighlightsProps {
  highlights: Highlight[]
  paddingTop?: string
  paddingBottom?: string
}

export const Highlights = ({
  highlights,
  paddingTop = "2rem",
  paddingBottom = "2rem",
}: HighlightsProps) => (
  <Section
    center
    noGap
    className={styles.root}
    style={{ paddingTop, paddingBottom }}
  >
    {highlights.map((highlight, index) => (
      <div className={styles.card} key={index}>
        <img
          src={highlight.image}
          alt={highlight.title}
          className={styles.image}
          loading="lazy"
        />
        <h3 className={styles.title}>{highlight.title}</h3>
        <p className={styles.description}>{highlight.description}</p>
        {highlight.ctaLink && (
          <a href={highlight.ctaLink} className={styles.cta}>
            Learn more
          </a>
        )}
      </div>
    ))}
  </Section>
)
