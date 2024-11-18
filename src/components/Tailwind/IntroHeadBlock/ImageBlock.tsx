function ImageBlock({ imageUrl, imageAlt }) {
  const isSvg = imageUrl.endsWith(".svg")

  return (
    <div className="sm:px-6 lg:px-0 lg:p-16">
      <img
        src={imageUrl}
        alt={imageAlt}
        loading="lazy"
        className={`w-full max-w-full ${isSvg ? "" : "rounded-xl shadow-xl ring-1 ring-gray-400/10"}`}
        style={{ height: "auto" }}
      />
    </div>
  )
}

export default ImageBlock
