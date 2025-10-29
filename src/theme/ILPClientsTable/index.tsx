import useBaseUrl from '@docusaurus/useBaseUrl'
import ilpClients from '../../../shared/ilp_clients.json'
import style from "./style.module.css"

type Client = {
  label: string
  logoSrc: string
  lightThemeLogoSrc?: string
  docsUrl?: string
  sourceUrl?: string
}

type ILPClientsTableProps = {
  language?: string
}

const clients: Client[] = ilpClients as Client[]

// @ts-expect-error TS6133
const openInNewTab = (url: string) => ({
  target: "_blank",
  rel: "noopener noreferrer",
})

export const ILPClientsTable = ({ language }: ILPClientsTableProps) => {
  const filteredClients =
    language !== null && language !== undefined && language !== ""
      ? clients.filter((client) => client.label === language)
      : clients

  return (
    <div className={style.root}>
      {filteredClients
        .sort(({ label: labelA }, { label: labelB }) =>
          labelA.localeCompare(labelB),
        )
        .map(({ label, logoSrc, lightThemeLogoSrc, docsUrl, sourceUrl }) => (
          <div className={style.client} key={label}>
            <div className={style.logo} data-language={label}>
              <img src={useBaseUrl(lightThemeLogoSrc ?? logoSrc)} alt={label} />
            </div>

            <div className={style.buttons}>
              {typeof docsUrl === "string" && (
                <a
                  className={style.button}
                  href={docsUrl}
                  {...openInNewTab(docsUrl)}
                >
                  <img
                    alt="Documentation icon"
                    height={22}
                    src={useBaseUrl("/images/icons/open-book.svg")}
                    className={style.docsIcon}
                    title="Documentation"
                    width={22}
                  />
                  View full docs
                </a>
              )}
              {typeof sourceUrl === "string" && (
                <a
                  className={style.button}
                  href={sourceUrl}
                  {...openInNewTab(sourceUrl)}
                >
                  <img
                    alt="Github icon"
                    height={22}
                    src={useBaseUrl("/images/github.svg")}
                    className={style.ghIcon}
                    title="Source"
                    width={22}
                  />
                  View source code
                </a>
              )}
            </div>
          </div>
        ))}
    </div>
  )
}
