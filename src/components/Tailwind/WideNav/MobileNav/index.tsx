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

type Feature = {
  name: string
  href: string
}

type NavLink = {
  name: string
  href: string
}

type MobileNavProps = {
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  features: Feature[]
  navLinks: NavLink[]
}

export default function MobileNav({
  mobileMenuOpen,
  setMobileMenuOpen,
  features,
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
          <div className="-my-6 divide-y mt-4 divide-gray-500/10 dark:divide-gray-700">
            <div className="space-y-2">
              {secondaryMenu.content ? (
                <Disclosure as="div" className="-mx-3 mb-4">
                  {secondaryMenu.content}
                  <div>
                    <hr />
                    <a
                      href="/"
                      className="-mx-3 block rounded-lg px-3 py-2.5 text-base font-semibold leading-7 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[rgb(33,34,44)]"
                    >
                      ← Return to homepage
                    </a>
                  </div>
                </Disclosure>
              ) : (
                <>
                  <Disclosure as="div" className="-mx-3 pt-4">
                    <DisclosureButton className="group flex w-full items-center justify-between rounded-lg py-2 pl-3 pr-3.5 text-base font-semibold leading-7 bg-white text-gray-700 dark:bg-[rgb(38,40,51)] dark:text-white hover:bg-gray-50 dark:hover:bg-[rgb(33,34,44)]">
                      Compare
                      <ChevronDownIcon
                        aria-hidden="true"
                        className="h-5 w-5 flex-none group-data-[open]:rotate-180"
                      />
                    </DisclosureButton>
                    <DisclosurePanel className="mt-2 space-y-2">
                      {features.map((item) => (
                        <DisclosureButton
                          key={item.name}
                          as="a"
                          href={item.href}
                          className="block rounded-lg text-black dark:text-white py-2 pl-6 pr-3 text-sm font-semibold leading-7 hover:bg-gray-50 dark:hover:bg-[rgb(33,34,44)]"
                        >
                          {item.name}
                        </DisclosureButton>
                      ))}
                    </DisclosurePanel>
                  </Disclosure>

                  <div className="flex flex-col space-y-1">
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
