import useBaseUrl from '@docusaurus/useBaseUrl'
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

const clients: Client[] = [
  {
    label: "Python",
    logoSrc: "/images/logos/python.svg",
    docsUrl: "https://py-questdb-client.readthedocs.io/en/latest/",
    sourceUrl: "https://github.com/questdb/py-questdb-client",
  },
  {
    label: "NodeJS",
    logoSrc: "/images/logos/nodejs-light.svg",
    lightThemeLogoSrc: "/images/logos/jsIconGreen.svg",
    docsUrl: "https://questdb.github.io/nodejs-questdb-client",
    sourceUrl: "https://github.com/questdb/nodejs-questdb-client",
  },
  {
    label: ".NET",
    logoSrc: "/images/logos/dotnet.svg",
    sourceUrl: "https://github.com/questdb/net-questdb-client",
  },
  {
    label: "Java",
    docsUrl: "/docs/reference/clients/java_ilp/",
    logoSrc: "/images/logos/java.svg",
  },
  {
    label: "C",
    logoSrc: "/images/logos/c.svg",
    docsUrl: "https://github.com/questdb/c-questdb-client/blob/main/doc/C.md",
    sourceUrl: "https://github.com/questdb/c-questdb-client",
  },
  {
    label: "C++",
    logoSrc: "/images/logos/cplusplus.svg",
    docsUrl: "https://github.com/questdb/c-questdb-client/blob/main/doc/CPP.md",
    sourceUrl: "https://github.com/questdb/c-questdb-client",
  },
  {
    label: "Golang",
    logoSrc: "/images/logos/go.svg",
    docsUrl: "https://pkg.go.dev/github.com/questdb/go-questdb-client/",
    sourceUrl: "https://github.com/questdb/go-questdb-client/",
  },
  {
    label: "Rust",
    logoSrc: "/images/logos/rust.svg",
    docsUrl: "https://docs.rs/crate/questdb-rs/latest",
    sourceUrl: "https://github.com/questdb/c-questdb-client",
  },
]

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
