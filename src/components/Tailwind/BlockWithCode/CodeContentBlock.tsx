import Highlight from "../../../components/Highlight"

function CodeContentBlock({ code, language }) {
  return (
    <div className="relative isolate overflow-hidden bg-pink-700 px-4 pt-6 sm:mx-auto sm:max-w-none sm:rounded-3xl sm:pl-6 sm:pr-0 sm:pt-6 lg:mx-0">
      <div
        className="absolute -inset-y-px -left-3 -z-10 w-full origin-bottom-left skew-x-[-30deg] bg-pink-100 opacity-20 ring-1 ring-inset ring-white blur-sm"
        aria-hidden="true"
      />
      <div className="mx-auto sm:mx-0">
        <div className="w-screen overflow-hidden rounded-tl-sm bg-code ring-1 ring-white/10">
          <div className="flex bg-gray-800/40 ring-1 ring-white/5">
            <div className="-mb-px flex text-sm font-medium leading-6 text-gray-400">
              <div className="border-b border-r border-b-white/20 border-r-white/10 bg-white/5 px-4 py-2 text-white">
                QuestDB SQL
              </div>
            </div>
          </div>
          <div className="px-.5 pb-14 pt-2">
            <Highlight code={code} language={language} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default CodeContentBlock
