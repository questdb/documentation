import { useLocation } from "react-router-dom"
import { hyphenToPascalCase } from "../../utils/hyphen-to-pascal"
import clsx from "clsx"
import Button from "@theme/Button"
import styles from "./styles.module.css"

type Props = {
  className?: string
}

const useButtonProps = () => {
  const { pathname } = useLocation()
  const origin = pathname.split("/")[1]
  const source = origin === "" ? "Main" : hyphenToPascalCase(origin)
  const url = "/download/"
  const destination = "Download"
  const ctaLabel = "Download"

  return { ctaLabel, source, destination, url }
}

export const MainCTA = ({ className }: Props) => {
  const { url, ctaLabel } = useButtonProps()

  return (
    <Button
      className={clsx(styles.ctaButton, styles.getQuestdb, className)}
      size="xsmall"
      variant="secondary"
      to={url}
    >
      {ctaLabel}
    </Button>
  )
}
