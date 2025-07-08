import {
  Dialog,
  DialogPanel,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react"
import { XMarkIcon, ChevronDownIcon } from "@heroicons/react/20/solid"
import { useNavbarSecondaryMenu } from "@docusaurus/theme-common/internal"
import SearchBar from "@theme/SearchBar"

type NavLink = {
  name: string
  href: string
}

type Feature = {
  name: string
  href: string
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  svg?: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

type MobileNavProps = {
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  productFeatures: Feature[]
  compareFeatures: Feature[]
  navLinks: NavLink[]
}

export default function MobileNav({
  mobileMenuOpen,
  setMobileMenuOpen,
  productFeatures,
  compareFeatures,
  navLinks,
}: MobileNavProps) {
  const secondaryMenu = useNavbarSecondaryMenu()

  return (
    <Dialog
      open={mobileMenuOpen}
      onClose={setMobileMenuOpen}
      className="lg:hidden"
    >
      <div className="fixed inset-0 z-10" />

      <DialogPanel className="fixed inset-y-0 right-0 z-10 w-full overflow-y-auto bg-white dark:bg-[rgb(33,34,44)] px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10 dark:sm:ring-gray-500/10">
        <div className="flex items-center justify-between">
          <a href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">QuestDB</span>
            QuestDB Logo
          </a>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="-m-2.5 rounded-md p-2.5 text-gray-700 dark:text-gray-300"
          >
            <span className="sr-only">Close menu</span>
            <XMarkIcon aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-14">
          <SearchBar />
        </div>
        <div className="flow-root">
          <div className="divide-y my-4 divide-gray-500/10 dark:divide-gray-700">
            <div className="space-y-2">
              {secondaryMenu.content ? (
                <Disclosure as="div" className="-mx-3 mb-4">
                  {secondaryMenu.content}
                  <div>
                    <hr />
                    <a
                      href="/"
                      className="-mx-3 block rounded-lg px-3 py-2.5 text-base font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[rgb(33,34,44)]"
                    >
                      ← Return to homepage
                    </a>
                  </div>
                </Disclosure>
              ) : (
                <>
                  <Disclosure as="div" className="-mx-3 pt-4" defaultOpen>
                    <DisclosureButton className="group flex w-full items-center justify-between rounded-lg py-2 pl-3 pr-3.5 text-base font-semibold bg-white text-gray-700 dark:bg-[rgb(38,40,51)] dark:text-white hover:bg-gray-50 dark:hover:bg-[rgb(33,34,44)]">
                      Product
                      <ChevronDownIcon
                        aria-hidden="true"
                        className="h-5 w-5 flex-none group-data-[open]:rotate-180"
                      />
                    </DisclosureButton>
                    <DisclosurePanel className="mt-2 space-y-2">
                      {productFeatures.map((item) => (
                        <DisclosureButton
                          key={item.name}
                          as="a"
                          href={item.href}
                          className="group flex items-center gap-x-3 rounded-lg text-white py-2 pl-8 pr-3 text-sm font-semibold hover:bg-[rgb(43,45,56)]"
                        >
                          {item.icon ? (
                            <item.icon
                              aria-hidden="true"
                              className="h-5 w-5 text-gray-300 group-hover:text-primary group-hover:fill-primary"
                            />
                          ) : item.svg ? (
                            <item.svg
                              aria-hidden="true"
                              className="h-5 w-5 fill-current text-gray-300 group-hover:text-primary group-hover:fill-primary"
                            />
                          ) : null}
                          {item.name}
                        </DisclosureButton>
                      ))}
                    </DisclosurePanel>
                  </Disclosure>

                  <Disclosure as="div" className="-mx-3 pt-4" defaultOpen>
                    <DisclosureButton className="group flex w-full items-center justify-between rounded-lg py-2 pl-3 pr-3.5 text-base font-semibold bg-white text-gray-700 dark:bg-[rgb(38,40,51)] dark:text-white hover:bg-gray-50 dark:hover:bg-[rgb(33,34,44)]">
                      Compare
                      <ChevronDownIcon
                        aria-hidden="true"
                        className="h-5 w-5 flex-none group-data-[open]:rotate-180"
                      />
                    </DisclosureButton>
                    <DisclosurePanel className="mt-2 space-y-2">
                      {compareFeatures.map((item) => (
                        <DisclosureButton
                          key={item.name}
                          as="a"
                          href={item.href}
                          className="group flex items-center gap-x-3 rounded-lg text-white py-2 pl-8 pr-3 text-sm font-semibold hover:bg-[rgb(43,45,56)]"
                        >
                          {item.icon ? (
                            <item.icon
                              aria-hidden="true"
                              className="h-5 w-5 text-gray-300 group-hover:text-primary group-hover:fill-primary"
                            />
                          ) : item.svg ? (
                            <item.svg
                              aria-hidden="true"
                              className="h-5 w-5 fill-current text-gray-300 group-hover:text-primary group-hover:fill-primary"
                            />
                          ) : null}
                          {item.name}
                        </DisclosureButton>
                      ))}
                    </DisclosurePanel>
                  </Disclosure>

                  <div className="flex flex-col space-y-2">
                    {navLinks.map((link) => (
                      <a
                        key={link.name}
                        href={link.href}
                        className="font-semibold text-base font-sans leading-6 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-[rgb(33,34,44)] rounded-md px-3 py-2"
                      >
                        {link.name}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogPanel>
    </Dialog>
  )
}
