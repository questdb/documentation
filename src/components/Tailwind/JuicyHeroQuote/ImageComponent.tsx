function ImageComponent({ imageUrl, imageAlt }) {
  return (
    <div className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl mt-4 xl:mt-0 xl:w-96 xl:flex-none mx-auto sm:mx-0">
      <div className="relative aspect-auto h-full">
        <img
          className="h-full w-full rounded-l object-contain mx-auto svg-mode-visible"
          src={imageUrl}
          alt={imageAlt}
          loading="lazy"
        />
      </div>
    </div>
  )
}

export default ImageComponent
