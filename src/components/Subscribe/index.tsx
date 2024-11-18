import { ReactNode, useState } from "react"
import type { FormEvent } from "react"
import { CSSTransition, TransitionGroup } from "react-transition-group"

import Input from "../../theme/Input"
import Button from "../../theme/Button"
import type { Props as ButtonProps } from "../../theme/Button"
import style from "./style.module.css"
import clsx from "clsx"
import emailPattern from "../../utils/emailPattern"

type Provider = "newsletter"

type Props = {
  placeholder?: string
  submitButtonText?: string
  submitButtonVariant?: ButtonProps["variant"]
  className?: string
  classNameInputs?: string
  renderSubmitButton?: (props: {
    loading: boolean
    defaultLoader: ReactNode
  }) => ReactNode
  eventTag?: string
}

const providers: { [key in Provider]: string } = {
  newsletter:
    "https://questdb.us7.list-manage.com/subscribe/post?u=f692ae4038a31e8ae997a0f29&id=bdd4ec2744",
}

const Spinner = () => <span className={style.loader} />

const Subscribe = ({
  placeholder = "Email address",
  submitButtonText = "SUBMIT",
  submitButtonVariant,
  className,
  classNameInputs,
  renderSubmitButton,
  eventTag = "newsletter_form_submitted",
}: Props) => {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setLoading(true)

    const target = event.target as HTMLFormElement
    const email = new FormData(target).get("email") as string

    try {
      await fetch(
        `${providers.newsletter}&EMAIL=${encodeURIComponent(email)}`,
        { method: "GET" },
      )
    } catch (e) {
      console.error("Subscription failed with error:", e.message || e)
    }

    if (typeof window !== "undefined" && window.posthog) {
      window.posthog.identify(email, { email })
      window.posthog.capture(eventTag, { email })
    } else {
      console.error("PostHog is not available.")
    }

    setLoading(false)
    setSent(true)
  }

  return (
    <form className={clsx(style.root, className)} onSubmit={onSubmit}>
      <TransitionGroup>
        <CSSTransition
          key={sent.toString()}
          timeout={200}
          classNames="transition-node"
        >
          {sent ? (
            <p className={style.success}>
              Thank you, we will be in touch soon!
            </p>
          ) : (
            <div className={clsx(style.inputs, classNameInputs)}>
              <Input
                className={style.input}
                name="email"
                type="email"
                title="Email address should be valid"
                placeholder={placeholder}
                required
                pattern={emailPattern}
              />

              {typeof renderSubmitButton === "function" ? (
                renderSubmitButton({ loading, defaultLoader: <Spinner /> })
              ) : (
                <Button
                  className={style.submit}
                  variant={submitButtonVariant}
                  type="submit"
                  disabled={loading}
                >
                  {loading ? <Spinner /> : submitButtonText}
                </Button>
              )}
            </div>
          )}
        </CSSTransition>
      </TransitionGroup>
    </form>
  )
}

export default Subscribe
