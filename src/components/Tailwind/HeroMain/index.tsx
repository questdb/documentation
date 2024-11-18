import BackgroundSVG from "./BackgroundSVG"
import Header from "./Header"

export default function HeroMain() {
  return (
    <div className="relative isolate overflow-hidden">
      <div className="dark:block hidden">
        <BackgroundSVG />
      </div>
      <div className="mx-auto max-w-7xl px-6 pb-24 pt-10 sm:pb-32 lg:px-8 lg:py-28">
        <div className="lg:pt-0 pt-6">
          <Header />
        </div>
      </div>
    </div>
  )
}
