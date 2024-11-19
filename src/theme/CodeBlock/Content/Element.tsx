import clsx from "clsx"
import Container from "@theme/CodeBlock/Container"
import type { Props } from "@theme/CodeBlock/Content/Element"

import styles from "./styles.module.css"

export default function CodeBlockJSX({
  children,
  className,
  demo,
}: Props & { demo?: string }): JSX.Element {
  return (
    <Container
      as="pre"
      tabIndex={0}
      className={clsx(styles.codeBlockStandalone, "thin-scrollbar", className)}
    >
      <code className={styles.codeBlockLines}>
        {children}
        {demo && (
          <a href={demo} className={styles.demoLink}>
            Demo this query
          </a>
        )}
      </code>
    </Container>
  )
}
