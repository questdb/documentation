import { useState, useEffect } from "react"

const ImageComponent = ({ src, alt, width = "100%", customStyles }) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const img = new Image()
    img.src = src
    img.onload = () => {
      const aspectRatio = img.naturalWidth / img.naturalHeight
      setDimensions({
        width: img.naturalWidth,
        height: img.naturalWidth / aspectRatio,
      })
    }
  }, [src])

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      width={dimensions.width}
      height={dimensions.height}
      className={`w-full max-w-full rounded-xl shadow-xl ring-1 ring-gray-400/10 ${customStyles}`}
      style={{ width: width, height: "auto" }}
    />
  )
}

export default ImageComponent
