import React from "react"
import style from "./style.module.css"
import clsx from "clsx"

type ToggleOption<T extends string> = {
  value: T
  label: React.ReactNode
  disabled?: boolean
}

type Props<T extends string> = {
  options: Array<ToggleOption<T>>
  selected?: T
  onClick: (value: T) => void
  disabledTitle?: string
  className?: string
}

export const Toggle = <T extends string>({
  options,
  selected,
  onClick,
  disabledTitle,
  className,
  ...props
}: Props<T>) => (
  <fieldset className={clsx(style.root, className)} {...props}>
    {options.map((option, index) => {
      const active = selected === option.value

      return (
        <button
          type="button"
          disabled={option.disabled}
          className={clsx(style.option, {
            [style.active]: active,
            [style.disabled]: option.disabled ?? false,
          })}
          key={index}
          onClick={() => onClick(option.value)}
          {...(option.disabled === true && { title: disabledTitle })}
        >
          <input type="radio" defaultChecked={active} className={style.input} />
          <label className={style.label}>{option.label}</label>
        </button>
      )
    })}
  </fieldset>
)
