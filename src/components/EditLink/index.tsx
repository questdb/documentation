import React from "react"
import customFields from "../../config/customFields"

function EditLink(): JSX.Element {
  const docLink = customFields.docIssueTemplate

  return (
    <div>
      <p>
        <span role="img" aria-label="star">
          ⭐{" "}
        </span>
        Something missing? Page not helpful?{" "}
        <a href={docLink} target="_blank" rel="noopener noreferrer">
          Please suggest an edit on GitHub.{" "}
          <span aria-hidden="true">&#x2197;</span>
        </a>
      </p>
    </div>
  )
}

export default EditLink
