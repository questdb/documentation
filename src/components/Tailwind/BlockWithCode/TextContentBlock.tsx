function TextContentBlock({ title, subtitle, description, center }) {
  return (
    <div
      className={`${
        center
          ? "mx-auto max-w-4xl sm:text-center"
          : "px-6 md:px-0 lg:pr-4 lg:pt-4 order-first lg:order-none"
      }`}
    >
      <h2 className="text-base font-semibold leading-7 text-primary">
        {title}
      </h2>
      <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        {subtitle}
      </p>
      <p
        dangerouslySetInnerHTML={{ __html: description }}
        className="mt-6 text-lg leading-8 text-text-base"
      />
    </div>
  )
}

export default TextContentBlock
