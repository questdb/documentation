import React from "react"
import ReactMarkdown from "react-markdown"
import CodeBlock from "@theme/CodeBlock"
import { usePluginData } from "@docusaurus/useGlobalData"
import styles from "./styles.module.css"

type Addr = {
  host?: string
  port?: number
}

type Auth = {
  kid?: string
  d?: string
  x?: string
  y?: string
}

type Props = {
  name: string
  lang: string
  header: boolean
  addr?: Addr
  auth?: Auth
}

/// Insert example code pulled from an external client library repository.
///
/// The following will insert the "ilp" example in Python,
/// including its associated markdown header.
/// ```tsx
/// <RemoteRepoExample name="ilp" lang="python" />
/// ```
///
/// To disable outputting the header, set `header` to `false`.
/// ```tsx
/// <RemoteRepoExample name="ilp-auth-tls" lang="java" header={false} />
/// ```
///
/// You may also replace portions of the code example dynamically:
/// ```tsx
/// <RemoteRepoExample
///   name="ilp-auth-tls"
///   lang="python"
///   header={false}
///   addr={{"host": "thehost", "port": 10101}}
///   auth={{"kid": "user_blah", "d": "dadad", "x": "xaxaxaxa", "y": "yayaya"}}
///   />
/// ```
///
/// The code itself is fetched at build time using the `remote-repo-example`
/// plugin.

export const RemoteRepoExample = ({
  name,
  lang,
  header = true,
  addr,
  auth,
}: Props) => {
  const { repoExample } = usePluginData<{ repoExample: number }>(
    "remote-repo-example",
  )

  const id = `${name}/${lang}`

  type Example = {
    name?: string
    lang?: string
    code?: string
    header?: string
    auth?: Auth
    addr?: {
      host: string
      port: string
    }
  }

  const example: Example | undefined = repoExample[id]

  if (example === undefined) {
    // The example is not in the remote-repo-example plugin data: its
    // source file has not landed in the client repo yet, or the manifest
    // entry is missing. The plugin (plugins/remote-repo-example) already
    // skips absent files with a warning rather than failing the build;
    // mirror that here instead of crashing the entire static-site
    // generation. The block renders once the example lands upstream.
    console.warn(
      `[RemoteRepoExample] no example "${id}" in remote-repo-example ` +
        `data; skipping. It will render once it lands in the source repo.`,
    )
    return null
  }

  const headerMd = example.header
  let code = example.code ?? ""

  const valueReplaceMap = [
    [example.addr?.host, addr?.host],
    [example.addr?.port?.toString(), addr?.port?.toString()],
    [example.auth?.kid, auth?.kid],
    [example.auth?.d, auth?.d],
    [example.auth?.x, auth?.x],
    [example.auth?.y, auth?.y],
  ].filter((entry) => !entry.some((item) => item === undefined)) as string[][]

  valueReplaceMap.forEach(([from, to]) => {
    code = code?.replaceAll(from, to)
  })

  return (
    <div>
      {header && headerMd !== undefined && (
        <ReactMarkdown className={styles.markdown}>{headerMd}</ReactMarkdown>
      )}
      <CodeBlock className={`language-${lang}`}>{code}</CodeBlock>
    </div>
  )
}
