import React from "react"
import styles from "./styles.module.css"
import customFields from "../../../config/customFields"

type Props = {
  text?: string
}

const FinanceLeadIn: React.FC<Props> = ({ text }) => {
  const defaultText = customFields.financeLeadIn
  const leadInText = text !== undefined && text !== "" ? text : defaultText

  return (
    <div
      className={styles.leadIn}
      dangerouslySetInnerHTML={{ __html: leadInText }}
    />
  )
}

export default FinanceLeadIn
