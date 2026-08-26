import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment"
import posthog from "posthog-js"

import { POSTHOG_TOKEN } from "./config"

type CookiebotConsent = {
  statistics?: boolean
}

type ConsentWindow = Window & {
  Cookiebot?: { consent?: CookiebotConsent }
  posthog?: typeof posthog
}

if (ExecutionEnvironment.canUseDOM) {
  const consentWindow = window as ConsentWindow

  posthog.init(POSTHOG_TOKEN, {
    api_host: "https://us.i.posthog.com",
    cookieless_mode: "on_reject",
  })
  consentWindow.posthog = posthog

  const apply = (consent?: CookiebotConsent) => {
    if (consent?.statistics) {
      posthog.opt_in_capturing({ captureEventName: null })
    } else {
      posthog.opt_out_capturing()
    }
  }

  const applyCookiebotConsent = () => apply(consentWindow.Cookiebot?.consent)

  if (consentWindow.Cookiebot) {
    applyCookiebotConsent()
  } else if (!posthog.has_opted_in_capturing()) {
    posthog.opt_out_capturing()
  }

  const cookiebotEvents = [
    "CookiebotOnConsentReady",
    "CookiebotOnAccept",
    "CookiebotOnDecline",
  ]
  cookiebotEvents.forEach((event) =>
    window.addEventListener(event, applyCookiebotConsent),
  )
}
