import ReactMarkdown from "react-markdown"

type Props = {
  rows: {
    [key: string]: {
      default: string
      description: string
      reloadable?: boolean
    }
  }
  pick?: string[]
}

export const ConfigTable = ({ rows, pick }: Props) => {
  return (
    <table className="config-table">
      <thead>
        <tr>
          <th>Property</th>
          <th>Default</th>
          <th>Reloadable</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(rows)
          .filter(([key]) => (Array.isArray(pick) ? pick.includes(key) : true))
          .map(([key, { default: defaultValue, description, reloadable }]) => (
            <tr key={key}>
              <td className="property-cell">{key}</td>
              <td>{defaultValue}</td>
              <td>{reloadable ? "Yes" : "No"}</td>
              <td>
                <ReactMarkdown>{description}</ReactMarkdown>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}