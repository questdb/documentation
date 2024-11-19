const TextBlock = ({ title, subtitle, description }) => {
  return (
    <div>
      <h2 className="text-base font-semibold leading-7 text-primary">
        {title}
      </h2>
      <p className="mt-2 text-3xl font-bold tracking-tight text-text-base sm:text-4xl">
        {subtitle}
      </p>
      <p
        dangerouslySetInnerHTML={{ __html: description }}
        className="mt-6 text-lg leading-8 text-text-base"
      />
    </div>
  )
}

export default TextBlock
