import { Row, Col } from "./types"
import style from "./styles.module.css"
import clsx from "clsx"
import Link from "@docusaurus/Link"
import React, { useState } from "react"

type Status =
  | "available"
  | "available-new"
  | "unavailable"
  | "not-applicable"
  | "coming-soon"
  | "contact-us"

const statusMap: { [key in Status]: JSX.Element } = {
  available: <span className={clsx(style.icon, style.iconCheck)} />,

  "available-new": (
    <span className={style.availableNew}>
      <span className={clsx(style.icon, style.iconCheck)} />
      <span className={style.availableNewLabel}>New!</span>
    </span>
  ),

  unavailable: <span className={clsx(style.icon, style.iconClose)} />,
  "not-applicable": <span>-</span>,
  "coming-soon": <span className={style.statusText}>Coming soon</span>,
  "contact-us": (
    <Link to="/enterprise/contact/" className={style.link}>
      Contact us
    </Link>
  ),
}

type Props = {
  rows: Row[]
  cols: Col[]
  title?: string
  firstColWidth?: React.CSSProperties["width"]
}

export const FeatureTable = ({ rows, cols, title, firstColWidth }: Props) => {
  const [activeRows, setActiveRows] = useState<Set<number>>(new Set([]))
  const hasDescriptions = rows.some((row) => row.description !== undefined)

  return (
    <table
      className={clsx(style.root, {
        [style.withDescriptions]: hasDescriptions,
      })}
    >
      <thead>
        <tr>
          <th style={{ minWidth: firstColWidth }} className={style.title}>
            {typeof title === "string" && title.toUpperCase()}
          </th>

          {cols.map(({ title, width }, index) => (
            <th key={index} style={{ width }}>
              {title}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {rows.map((row, rowIndex) => {
          const withDesciption = typeof row.description === "string"
          const rowClasses = [
            style.row,
            rowIndex % 2 === 0 ? style.odd : style.even,
          ]

          return (
            <React.Fragment key={rowIndex}>
              <tr
                onClick={
                  withDesciption
                    ? () => {
                        activeRows.has(rowIndex)
                          ? activeRows.delete(rowIndex)
                          : activeRows.add(rowIndex)
                        setActiveRows(new Set(activeRows))
                      }
                    : undefined
                }
                className={clsx(...rowClasses, {
                  [style.rowToggle]: withDesciption,
                  [style.activeRow]: activeRows.has(rowIndex),
                })}
              >
                <td className={style.title} style={{ minWidth: firstColWidth }}>
                  {withDesciption && <span className={style.chevron} />}

                  {row.title}
                </td>

                {cols.map((col, colIndex) => (
                  <td
                    key={`${rowIndex}-${colIndex}`}
                    style={{ minWidth: col.width }}
                  >
                    {statusMap[row.values[colIndex]] ?? (
                      <span className={style.statusText}>
                        {row.values[colIndex]}
                      </span>
                    )}
                  </td>
                ))}
              </tr>

              {activeRows.has(rowIndex) && (
                <tr className={clsx(style.description, ...rowClasses)}>
                  <td colSpan={cols.length + 1 /* add 1 for title column */}>
                    <p>{row.description}</p>
                  </td>
                </tr>
              )}
            </React.Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
