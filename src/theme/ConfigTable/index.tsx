import React from "react"
import ReactMarkdown from "react-markdown"

type Props = {
  rows: { [key: string]: { default: string; description: string } }
  pick?: string[]
}

export const ConfigTable = ({ rows, pick }: Props) => {
  return (
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Default</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(rows)
          .filter(([key]) => (Array.isArray(pick) ? pick.includes(key) : true))
          .map(([key, { default: defaultValue, description }]) => (
            <tr key={key}>
              <td className="property-cell">{key}</td>
              <td>{defaultValue}</td>
              <td>
                <ReactMarkdown>{description}</ReactMarkdown>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}
