import React from "react"

import useUserPreferencesContext from "@theme/hooks/useUserPreferencesContext"

import styles from "./styles.module.css"

const AnnouncementBar = () => {
  const { isAnnouncementBarClosed, closeAnnouncementBar } =
    useUserPreferencesContext()

  if (isAnnouncementBarClosed) {
    return null
  }

  return (
    <div className={styles.announcement} role="banner">
      <p className={styles.announcement__content}>
        <span>
          QuestDB powers finance. Checkout our financial market data{" "}
          <a
            className={styles.announcement__link}
            href="/dashboards/crypto?utm_source=Website&utm_content=Banner&utm_campaign=TQA"
            rel="noopener noreferrer"
            target="_blank"
          >
            real-time dashboard
          </a>
          ! ⭐️
        </span>
      </p>

      <button
        aria-label="Close"
        className={styles.announcement__close}
        onClick={closeAnnouncementBar}
        type="button"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  )
}

export default AnnouncementBar
