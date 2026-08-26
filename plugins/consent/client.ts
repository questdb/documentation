import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment"
import type { ClientModule } from "@docusaurus/types"
import posthog from "posthog-js"

import { POSTHOG_TOKEN } from "./config"

type CookiebotConsent = {
  statistics?: boolean
}

type ConsentWindow = Window & {
  Cookiebot?: {
    consent?: CookiebotConsent
  }
  posthog?: typeof posthog
}

let postHogInitialized = false
let currentPageCaptured = false

if (ExecutionEnvironment.canUseDOM) {
  const consentWindow = window as ConsentWindow

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

  const applyCookiebotConsent = () => {
    const cookiebot = consentWindow.Cookiebot
    const statistics = cookiebot?.consent?.statistics
    if (typeof statistics !== "boolean") return

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

  applyCookiebotConsent()

  const cookiebotEvents = [
    "CookiebotOnConsentReady",
    "CookiebotOnAccept",
    "CookiebotOnDecline",
  ]
  cookiebotEvents.forEach((event) =>
    window.addEventListener(event, applyCookiebotConsent),
  )
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
