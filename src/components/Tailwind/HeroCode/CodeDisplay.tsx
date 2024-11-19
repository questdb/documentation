import Highlight from "../../../components/Highlight"

const CodeDisplay = ({ code, queryLink }) => {
  const handleDemoClick = () => {
    window.posthog.capture("demo_started", {
      source: "enterprise",
    })
  }

  return (
    <div className="mt-24 sm:mt-24 md:mx-auto md:max-w-2xl lg:mx-0 lg:mt-8 lg:w-screen">
      <div className="shadow-lg md:rounded-3xl">
        <div className="bg-pink-700 [clip-path:inset(0)] md:[clip-path:inset(0_round_theme(borderRadius.3xl))]">
          <div
            className="blur-sm absolute -inset-y-px left-1/2 -z-10 ml-10 w-[200%] skew-x-[-30deg] bg-pink-100 opacity-20 ring-1 ring-inset ring-white md:ml-20 lg:ml-36"
            aria-hidden="true"
          />
          <div className="relative px-6 pt-8 sm:pt-8 md:pl-8 md:pr-0">
            <div className="mx-auto max-w-2xl md:mx-0 md:max-w-none">
              <div className="w-screen overflow-hidden rounded-tl-xl bg-code relative">
                <div className="flex justify-between bg-gray-800/40 ring-1 ring-white/5 relative">
                  <div className="flex text-sm font-medium leading-6 text-gray-400">
                    <div className="border-b border-r border-b-white/20 border-r-white/10 bg-white/5 px-4 py-2 text-white">
                      QuestDB SQL
                    </div>
                    <a
                      href={queryLink}
                      className="ml-96 border text-democode hover:text-white px-4 py-2"
                      onClick={handleDemoClick} // Capture demo started event
                    >
                      Demo this query
                    </a>
                  </div>
                </div>
                <div className="px-.5 pb-4 pt-.5">
                  <Highlight code={code} language="questdb-sql" />{" "}
                </div>
              </div>
            </div>
            <div
              className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10 md:rounded-3xl"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default CodeDisplay
