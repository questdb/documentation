interface ImageSectionProps {
  src: string
  alt: string
  className?: string
}

export default function ImageSection({
  src,
  alt,
  className,
}: ImageSectionProps) {
  const defaultClasses = "w-full rounded-xl shadow-2xl ring-1 ring-gray-900/10"
  return (
    <div className="relative overflow-hidden pt-12 pb-10 sm:pt-4 sm:pb-0">
      <div className="mx-auto max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-7xl sm:px-0 px-6 lg:px-8 text-center">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={className || defaultClasses}
        />
        <div className="relative" aria-hidden="true">
          <div className="absolute -inset-x-20 bottom-0 bg-gradient-to-t pt-[7%]" />
        </div>
      </div>
    </div>
  )
}
