import { useEffect, useState } from "react"

export type YouTubeEmbedProps = {
  videoId?: string
}

const YouTubeEmbed = ({ videoId = "sz20YJ-KE1U" }: YouTubeEmbedProps) => {
  const [iframeLoaded, setIframeLoaded] = useState(true)
  const embedUrl = `https://www.youtube.com/embed/${videoId}`

  useEffect(() => {
    const handleVideoStart = () => {
      try {
        posthog.capture("video_started", { videoId })
      } catch (error) {
        console.error("PostHog event capture failed:", error)
      }
    }

    const iframeElement = document.querySelector(
      'iframe[src*="youtube.com/embed"]',
    ) as HTMLIFrameElement | null

    if (iframeElement) {
      iframeElement.addEventListener("load", handleVideoStart)
      
      // Check if the iframe actually loaded
      if (iframeElement.contentWindow) {
        setIframeLoaded(true)
      } else {
        setIframeLoaded(false)
      }
    }

    return () => {
      if (iframeElement) {
        iframeElement.removeEventListener("load", handleVideoStart)
      }
    }
  }, [videoId])

  if (!iframeLoaded) {
    return (
      <div style={styles.fallbackContainer}>
        <p>The video could not be loaded. It may be blocked by a browser extension.</p>
        <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">
          Watch on YouTube
        </a>
      </div>
    )
  }

  return (
    <div style={styles.videoContainer}>
      <iframe
        src={embedUrl}
        title="YouTube video player"
        allow="encrypted-media"
        allowFullScreen
        style={styles.iframe}
        onError={() => setIframeLoaded(false)}
      ></iframe>
    </div>
  )
}

const styles: {
  videoContainer: React.CSSProperties
  iframe: React.CSSProperties
  fallbackContainer: React.CSSProperties
} = {
  videoContainer: {
    position: "relative",
    paddingBottom: "56.25%", // 16:9
    paddingTop: "25px",
    height: 0,
  },
  iframe: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    paddingTop: ".5rem",
    paddingBottom: "1.5rem",
  },
  fallbackContainer: {
    textAlign: "center",
    padding: "20px",
    border: "1px solid #ccc",
    borderRadius: "4px",
  },
}

export default YouTubeEmbed
