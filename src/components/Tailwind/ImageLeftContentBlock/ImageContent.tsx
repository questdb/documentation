const ImageContent = ({ src, alt, width = "auto", height = "auto" }) => {
  return (
    <div className="flex items-start justify-end lg:order-first">
      <img
        src={src}
        alt={alt}
        className="w-full max-w-none sm:w-auto sm:max-w-full lg:w-auto lg:max-w-2xl rounded-xl shadow-xl ring-1 ring-gray-400/10"
        style={{ width: width, height: height }}
        loading="lazy"
      />
    </div>
  )
}

export default ImageContent
