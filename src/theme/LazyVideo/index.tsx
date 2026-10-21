import useBaseUrl from "@docusaurus/useBaseUrl"
import React, { useEffect, useRef, useState } from "react"

type Props = Omit<
  React.VideoHTMLAttributes<HTMLVideoElement>,
  "poster" | "src" | "width"
> & {
  label: string
  poster: string
  src: string
  width?: number | string
}

const LazyVideo: React.FC<Props> = ({
  autoPlay,
  controls,
  label,
  poster,
  src,
  style,
  width = "100%",
  ...videoProps
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const resolvedPoster = useBaseUrl(poster)
  const resolvedSrc = useBaseUrl(src)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener("change", updatePreference)
    return () => mediaQuery.removeEventListener("change", updatePreference)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (container == null) return

    if (!("IntersectionObserver" in window)) {
      setIsNearViewport(true)
      setShouldLoad(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting)
        if (entry.isIntersecting) setShouldLoad(true)
      },
      { rootMargin: "300px 0px" },
    )

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (video == null || !autoPlay || !shouldLoad) return

    if (isNearViewport && !prefersReducedMotion) {
      void video.play().catch(() => undefined)
    } else {
      video.pause()
    }
  }, [autoPlay, isNearViewport, prefersReducedMotion, shouldLoad])

  return (
    <div ref={containerRef} style={{ margin: "0 auto", width }}>
      <video
        {...videoProps}
        ref={videoRef}
        aria-label={label}
        autoPlay={autoPlay && !prefersReducedMotion}
        controls={controls || prefersReducedMotion}
        poster={resolvedPoster}
        preload={shouldLoad ? "metadata" : "none"}
        src={shouldLoad ? resolvedSrc : undefined}
        style={{
          display: "block",
          height: "auto",
          maxWidth: "100%",
          width: "100%",
          ...style,
        }}
      >
        <a href={resolvedSrc}>Watch: {label}</a>
      </video>
    </div>
  )
}

export default LazyVideo
