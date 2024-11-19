import React from "react"
import styles from "./styles.module.css"
import { NavLinkProps } from "@theme/NavbarItem/DefaultNavbarItem"
import Link from "@docusaurus/Link"
import clsx from "clsx"

export type Props = NavLinkProps & {
  subtitle?: React.ReactNode
}

export const SingleItem = ({ to, href, label, subtitle, className }: Props) => {
  return (
    <div className={clsx(styles.item, className)}>
      <Link to={to} href={href} className="dropdown__link">
        <span>{label}</span>
        {subtitle !== undefined && <small>{subtitle}</small>}
      </Link>
    </div>
  )
}

export const FlyoverItem = ({ items }: { items: Props[] }) => (
  <>
    {items.map((item, i) => (
      <SingleItem key={i} {...item} />
    ))}
  </>
)
