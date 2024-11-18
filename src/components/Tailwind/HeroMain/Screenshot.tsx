export default function Screenshot() {
  return (
    <div className="mx-auto mt-16 flex max-w-2xl sm:mt-24 lg:ml-10 lg:mr-0 lg:mt-0 lg:max-w-none lg:flex-none xl:ml-32">
      <div className="max-w-3xl flex-none sm:max-w-5xl lg:max-w-none">
        <a href="https://demo.questdb.io/">
          <img
            alt="App screenshot"
            src="/images/pages/index/full-screen.webp"
            loading="lazy"
            className="w-[76rem] rounded-md bg-white/5 shadow-2xl ring-1 ring-white/10"
          />
        </a>
      </div>
    </div>
  )
}
