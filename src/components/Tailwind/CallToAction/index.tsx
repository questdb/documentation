import Button from "@theme/Button"

export function CallToAction() {
  return (
    <div className="relative pb-16 pt-20 text-center sm:py-24">
      <hgroup>
        <h2 className="text-primary text-base font-semibold leading-7">
          The next generation has arrived
        </h2>
        <p className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
          Upgrade to QuestDB
        </p>
      </hgroup>
      <p className="mx-auto mt-6 max-w-xs text-sm/6">
        Hyper ingestion, millisecond queries, powerful and simple SQL. And lower
        bills through peak efficiency.
      </p>
      <div className="mt-8">
        <Button className="w-full sm:w-auto" href="/download/">
          Download
        </Button>
      </div>
    </div>
  )
}
