import { useState, useEffect, useRef } from "react"
import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment"
import customFields from "../config/customFields"

type WindowWithPosthog = Window & {
  posthog: {
    get_distinct_id: () => string
  }
}

const MAX_ATTEMPTS = 3

export const useCloudUrl = () => {
  const [url, setUrl] = useState(customFields.cloudUrl)
  const attempts = useRef(1)

  useEffect(() => {
    let interval: NodeJS.Timeout

    if (ExecutionEnvironment.canUseDOM) {
      console.log("Running in browser environment")

      const win = window as unknown as WindowWithPosthog

      interval = setInterval(() => {
        if (attempts.current >= MAX_ATTEMPTS) {
          clearInterval(interval)
        }

        attempts.current += 1

        const hasPosthog = Boolean(win.posthog?.get_distinct_id)

        if (hasPosthog) {
          const id = win.posthog.get_distinct_id()
          if (!url.includes(`#id=${id}`)) {
            setUrl(`${url}#id=${id}`)
          }
          clearInterval(interval)
        }
      }, 200)
    } else {
      console.log("Not running in browser environment")
    }

    return () => {
      clearInterval(interval)
    }
  }, [url])

  return url
}
