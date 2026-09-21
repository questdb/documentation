import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment"
import type { ClientModule } from "@docusaurus/types"
import posthog from "posthog-js"

import { GOOGLE_ADS_ID, POSTHOG_TOKEN } from "./config"

type CookiebotConsent = {
  marketing?: boolean
  statistics?: boolean
  method?: "explicit" | "implied" | null
}

type ConsentWindow = Window & {
  Cookiebot?: {
    consent?: CookiebotConsent
    hasResponse?: boolean
  }
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
  posthog?: typeof posthog
}

let postHogInitialized = false
let currentPageCaptured = false

if (ExecutionEnvironment.canUseDOM) {
  const consentWindow = window as ConsentWindow

  const applyGoogleAdsConsent = () => {
    if (
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl === true ||
      consentWindow.Cookiebot?.consent?.marketing !== true ||
      document.querySelector("script[data-qdb-google-ads]")
    ) {
      return
    }

    consentWindow.dataLayer = consentWindow.dataLayer || []
    consentWindow.gtag =
      consentWindow.gtag ||
      function (...args: unknown[]) {
        consentWindow.dataLayer?.push(args)
      }
    consentWindow.gtag("js", new Date())
    consentWindow.gtag("config", GOOGLE_ADS_ID)

    const googleAdsScript = document.createElement("script")
    googleAdsScript.async = true
    googleAdsScript.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`
    googleAdsScript.setAttribute("data-qdb-google-ads", "")
    document.head.appendChild(googleAdsScript)
  }

  const initialize = () => {
    if (!postHogInitialized) {
      posthog.init(POSTHOG_TOKEN, {
        api_host: "https://us.i.posthog.com",
        capture_pageview: false,
        cookieless_mode: "on_reject",
        opt_out_capturing_by_default: true,
      })
      postHogInitialized = true
    }
  }

  const applyCookiebotConsent = (fromCookiebotEvent = false) => {
    const cookiebot = consentWindow.Cookiebot
    const statistics = cookiebot?.consent?.statistics

    // Cookiebot's category values default to false before its stored state is
    // ready. Trust a mount-time snapshot only when Cookiebot marks it as a
    // response (including a stored rejection) or as implied consent. Its
    // lifecycle events are authoritative even when no response was required.
    const hasSettledConsent =
      fromCookiebotEvent ||
      cookiebot?.hasResponse === true ||
      cookiebot?.consent?.method === "implied"
    if (!hasSettledConsent) return

    if (typeof statistics !== "boolean") return

    applyGoogleAdsConsent()
    initialize()
    consentWindow.posthog = posthog
    if (statistics) {
      posthog.opt_in_capturing({ captureEventName: null })
    } else {
      posthog.opt_out_capturing()
    }

    if (!currentPageCaptured) {
      currentPageCaptured = true
      posthog.capture("$pageview", {
        $current_url: window.location.href,
        $referrer: document.referrer,
      })
    }
  }

  const handleCookiebotEvent = () => applyCookiebotConsent(true)

  const cookiebotEvents = [
    "CookiebotOnConsentReady",
    "CookiebotOnAccept",
    "CookiebotOnDecline",
  ]
  cookiebotEvents.forEach((event) =>
    window.addEventListener(event, handleCookiebotEvent),
  )
  applyCookiebotConsent()
}

const clientModule: ClientModule = {
  onRouteDidUpdate({ location, previousLocation }) {
    if (!postHogInitialized || !previousLocation) return

    const nextPath = location.pathname + location.search + location.hash
    const previousPath =
      previousLocation.pathname +
      previousLocation.search +
      previousLocation.hash
    if (nextPath === previousPath) return

    posthog.capture("$pageview", {
      $current_url: new URL(nextPath, window.location.origin).href,
      $referrer: new URL(previousPath, window.location.origin).href,
    })
  },
}

export default clientModule
