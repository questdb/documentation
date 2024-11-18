import { Highlight as Prism, Language, PrismTheme } from "prism-react-renderer"

import DarkTheme from "../../internals/prism-dracula"
import LightTheme from "../../internals/prism-github"

const themes = {
  light: LightTheme,
  dark: DarkTheme,
}

const Highlight = ({
  code,
  theme = "dark",
  language = "questdb-sql",
  className,
}: {
  code: string
  theme?: "light" | "dark"
  language?: Language | "questdb-sql"
  className?: string
}) => (
  <div className={className}>
    <Prism language={language} code={code} theme={themes[theme] as PrismTheme}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={className} style={style}>
          {tokens.map((line, i) => {
            const lineProps = getLineProps({ line })
            return (
              <div key={i} {...lineProps}>
                {line.map((token, key) => {
                  const tokenProps = getTokenProps({ token })
                  return <span key={key} {...tokenProps} />
                })}
              </div>
            )
          })}
        </pre>
      )}
    </Prism>
  </div>
)

export default Highlight
