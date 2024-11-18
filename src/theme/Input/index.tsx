import clsx from "clsx"

import styles from "./styles.module.css"

type Props = Readonly<{
  value?: string
  defaultValue?: string
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
  name: string
  pattern?: string
  placeholder?: string
  required?: boolean
  title?: string
  type?: "text" | "number" | "email"
}>

const Input = ({
  value,
  defaultValue,
  onChange,
  className,
  name,
  pattern,
  placeholder,
  required,
  title,
  type = "text",
}: Props) => {
  const classes = clsx(className, styles.input)

  return (
    <input
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      className={classes}
      name={name}
      required={required}
      pattern={pattern}
      placeholder={placeholder}
      title={title}
      type={type}
    />
  )
}

export default Input
