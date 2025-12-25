import clsx from "clsx"
import { useThemeConfig, usePrismTheme } from "@docusaurus/theme-common"
import {
  parseLanguage,
  parseLines,
  containsLineNumbers,
  useCodeWordWrap,
} from "@docusaurus/theme-common/internal"
import { Highlight, type Language } from "prism-react-renderer"
import Line from "@theme/CodeBlock/Line"
import CopyButton from "@theme/CodeBlock/CopyButton"
import WordWrapButton from "@theme/CodeBlock/WordWrapButton"
import Container from "@theme/CodeBlock/Container"
import type { Props as OriginalProps } from "@theme/CodeBlock"

import styles from "./styles.module.css"

type Props = OriginalProps & { demo?: boolean }

const codeBlockTitleRegex = /title=(?<quote>["'])(?<title>.*?)\1/
const codeBlockDemoRegex = /\bdemo\b/

function normalizeLanguage(language: string | undefined): string | undefined {
  return language?.toLowerCase()
}

function parseCodeBlockTitle(metastring?: string): string {
  return metastring?.match(codeBlockTitleRegex)?.groups?.title ?? ""
}

function parseCodeBlockDemo(metastring?: string): boolean {
  return codeBlockDemoRegex.test(metastring ?? "")
}

export default function CodeBlockString({
  children,
  className: blockClassName = "",
  metastring,
  title: titleProp,
  showLineNumbers: showLineNumbersProp,
  language: languageProp,
  demo: demoProp,
}: Props): JSX.Element {
  const {
    prism: { defaultLanguage, magicComments },
  } = useThemeConfig()
  const language = normalizeLanguage(
    languageProp ?? parseLanguage(blockClassName) ?? defaultLanguage,
  )

  const prismTheme = usePrismTheme()
  const wordWrap = useCodeWordWrap()

  const title = parseCodeBlockTitle(metastring) || titleProp
  const demo = parseCodeBlockDemo(metastring) || demoProp

  const { lineClassNames, code } = parseLines(children, {
    metastring,
    language,
    magicComments,
  })
  const showLineNumbers = showLineNumbersProp ?? containsLineNumbers(metastring)

  const demoUrl = demo
    ? `https://demo.questdb.io/?query=${encodeURIComponent(code)}&executeQuery=true`
    : null

  const handleDemoClick = () => {
    window.posthog?.capture("demo_started", { title })
  }

  return (
    <Container
      as="div"
      className={clsx(
        blockClassName,
        language &&
          !blockClassName.includes(`language-${language}`) &&
          `language-${language}`,
      )}
    >
      {title && (
        <div className={styles.codeBlockTitle}>
          <span>{title}</span>
          {demoUrl && (
            <a
              href={demoUrl}
              className={styles.demoLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDemoClick}
            >
              Demo this query
            </a>
          )}
        </div>
      )}
      <div className={styles.codeBlockContent}>
        <Highlight
          theme={prismTheme}
          code={code}
          language={(language ?? "text") as Language}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              tabIndex={0}
              ref={wordWrap.codeBlockRef}
              className={clsx(className, styles.codeBlock, "thin-scrollbar")}
              style={style}
            >
              <code
                className={clsx(
                  styles.codeBlockLines,
                  showLineNumbers && styles.codeBlockLinesWithNumbering,
                )}
              >
                {tokens.map((line, i) => (
                  <Line
                    key={i}
                    line={line}
                    getLineProps={getLineProps}
                    getTokenProps={getTokenProps}
                    classNames={lineClassNames[i]}
                    showLineNumbers={showLineNumbers}
                  />
                ))}
              </code>
            </pre>
          )}
        </Highlight>
        <div className={styles.buttonGroup}>
          {(wordWrap.isEnabled || wordWrap.isCodeScrollable) && (
            <WordWrapButton
              className={styles.codeButton}
              onClick={() => wordWrap.toggle()}
              isEnabled={wordWrap.isEnabled}
            />
          )}
          <CopyButton className={styles.codeButton} code={code} />
        </div>
      </div>
    </Container>
  )
}
