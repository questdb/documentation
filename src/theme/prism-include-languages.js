import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment"
import siteConfig from "@generated/docusaurus.config"
import { constants, dataTypes, functions, keywords } from "@questdb/sql-grammar"

const functionPattern = new RegExp(
  `(${functions
      .filter(fn => !keywords.includes(fn))
      .map(fn => fn.replace(/[\\\{\}\*\+\?\|\^\$\.\[\]\(\)]/g, '\\$&'))
      .join('|')})(?=\\s*\\()`,
  'i'
)

const prismIncludeLanguages = (PrismObject) => {
  if (ExecutionEnvironment.canUseDOM) {
    const {
      themeConfig: { prism: { additionalLanguages = [] } = {} },
    } = siteConfig
    window.Prism = PrismObject
    additionalLanguages.forEach((lang) => {
      require(`prismjs/components/prism-${lang}`) // eslint-disable-line
    })

    Prism.languages.sql.keyword = {
      pattern: new RegExp(`\\b(?:${keywords.join("|")})\\b`, "i"),
      greedy: true
    }

    Prism.languages.insertBefore('sql', 'keyword', {
      'questdb-function': {
        pattern: functionPattern,
        greedy: true,
      },
      'questdb-datatype': {
        pattern: new RegExp(`\\b(?:${dataTypes.join("|")})\\b`, "i"),
        greedy: true
      },
      'questdb-constant': {
        pattern: new RegExp(`\\b(?:${constants.join("|")})\\b`, "i"),
        greedy: true
      },
      'time-unit': {
        pattern: /\b(\d+)([utsmhdwmy])\b/i,
        greedy: true,
        inside: {
          'number': /\d+/,
          'unit': /[utsmhdwmy]/i
        }
      },
      'floating-point-number': {
        pattern: /\b([+-]?\d+\.\d+[eE]?[+-]?\d+)\b/,
        greedy: false
      },
      'hex-integer': {
        pattern: /\b0[xX][0-9a-fA-F]+\b/,
        greedy: false
      },
      'integer': {
        pattern: /\b[+-]?\d+((_)?\d+)*[Ll]?\b/,
        greedy: false
      },
      'sql-variable': {
        pattern: /@[a-zA-Z_]\w*/,
        greedy: true
      },
      array: {
        pattern: /\bARRAY(?=\s*\[)/i,
        greedy: true
      },
      operator: {
        pattern: /[<>=!%&+\-*/|~^:]/,
        greedy: true
      }
    })

    Prism.languages['questdb-sql'] = Prism.languages.extend('sql', {})
    delete window.Prism
  }
}

export default prismIncludeLanguages
