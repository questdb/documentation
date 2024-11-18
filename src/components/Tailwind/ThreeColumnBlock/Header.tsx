import React from "react"

interface HeaderProps {
  title: string
  subtitle: string
  description: string
}

const Header: React.FC<HeaderProps> = ({ title, subtitle, description }) => (
  <div className="mx-auto max-w-2xl lg:text-center">
    <h2 className="text-base font-semibold leading-7 text-primary">{title}</h2>
    <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
      {subtitle}
    </p>
    <p className="mt-6 text-lg leading-8">{description}</p>
  </div>
)

export default Header
