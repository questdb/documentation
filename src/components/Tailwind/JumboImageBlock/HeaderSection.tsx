interface HeaderSectionProps {
  title: string
  subtitle: string
  description: string
}

export default function HeaderSection({
  title,
  subtitle,
  description,
}: HeaderSectionProps) {
  return (
    <div className="mx-auto max-w-2xl sm:text-center">
      <h2 className="text-base font-semibold leading-7 text-primary">
        {title}
      </h2>
      <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        {subtitle}
      </p>
      <p className="mt-6 text-lg leading-8">{description}</p>
    </div>
  )
}
