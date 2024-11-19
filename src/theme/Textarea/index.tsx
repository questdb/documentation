import clsx from "clsx"

import styles from "./styles.module.css"
import React from "react"

type Props = {
  value?: string
  defaultValue?: string
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  className?: string
  name: string
  placeholder?: string
  required?: boolean
  title?: string
  rows?: number
}

const Textarea = ({
  value,
  defaultValue,
  onChange,
  className,
  name,
  placeholder,
  required,
  rows,
  title,
}: Props) => {
  const classes = clsx(className, styles.textarea)

  return (
    <textarea
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      className={classes}
      name={name}
      required={required}
      placeholder={placeholder}
      rows={rows ?? 4}
      title={title}
    />
  )
}

export default Textarea
