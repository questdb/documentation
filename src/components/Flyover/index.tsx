import React from "react"

import * as HoverCard from "@radix-ui/react-hover-card"

type Props = React.ComponentProps<typeof HoverCard.Root> & {
  children: React.ReactNode
  content: JSX.Element
}

export const Flyover = ({ children, content, ...rootProps }: Props) => {
  return (
    <HoverCard.Root openDelay={0} closeDelay={50} {...rootProps}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>{content}</HoverCard.Portal>
    </HoverCard.Root>
  )
}

export { Content, Arrow } from "@radix-ui/react-hover-card"
