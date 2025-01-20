import Heading from '@theme/Heading'

type ErrorCode = {
  code: string
  component: string
  errno: string
  summary: string
  explanation: string
  docLink?: string
}

// This is a stub - will be replaced with actual data from the repos later
const errorCodes: ErrorCode[] = [
  {
    code: "ER001",
    component: "replication",
    errno: "001",
    summary: "Replication target not found",
    explanation: "QuestDB cannot establish a replication connection to the target instance. Check network connectivity, hostname, and firewall settings.",
    docLink: "/docs/operations/replication/",
  },
  // More error codes will be added here from the core repo
]

type ErrorCodesTableProps = {
  type?: "opensource" | "enterprise"
}

export const ErrorCodesTable = ({ type }: ErrorCodesTableProps) => {
  const filteredErrors = type
    ? errorCodes.filter(error => type === "enterprise" ? error.code.startsWith("EE") : !error.code.startsWith("EE"))
    : errorCodes

  return (
    <div>
      {filteredErrors.map((error) => (
        <div key={error.code}>
          <Heading as="h3" id={error.code}>{error.code}</Heading>
          <p>{error.summary}</p>
          <p>{error.explanation}</p>
          {error.docLink && (
            <a href={error.docLink}>
              Learn more
            </a>
          )}
        </div>
      ))}
    </div>
  )
} 