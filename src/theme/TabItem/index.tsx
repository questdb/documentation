import React, { ReactNode } from "react"

export type Props = {
  readonly children: ReactNode
  readonly value: string
  readonly hidden?: boolean
  readonly className?: string
}

function TabItem({ children, hidden, className }: Props): JSX.Element {
  return (
    <div role="tabpanel" {...{ hidden, className }}>
      {children}
    </div>
  )
}

export default TabItem
