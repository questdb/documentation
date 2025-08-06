import Link from "@docusaurus/Link"
import React from "react"
import { usePluginData } from "@docusaurus/useGlobalData"
import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { StarIcon } from "@heroicons/react/24/solid"

export default function CustomNavbarItems() {
  const { release } = usePluginData("fetch-latest-release")
  const { repo } = usePluginData("fetch-repo")

  // Format star count similar to the original implementation
  const formatStarCount = (count) => {
    if (!count) return null
    return count >= 1000
      ? `${(count / 1000).toFixed(1)}k`
      : count.toLocaleString()
  }

  const version = release?.name || "latest"
  const starCount = formatStarCount(repo?.stargazers_count)

  const versionUrl = `https://github.com/questdb/questdb/releases/tag/${version}`

  return (
    <>
      <Link
        className="navbar__item navbar__link navbar__enterprise-link font-semibold font-sans font-normal"
        href="https://questdb.com/enterprise/"
        target="_self"
      >
        ⚡️ QuestDB Enterprise
      </Link>
      <div className="navbar__item dropdown dropdown--hoverable dropdown--left min-w-fit" style={{paddingLeft: 0, paddingRight: 0}}>
        <Link
          className="navbar__item navbar__link header-github-link font-semibold font-sans whitespace-nowrap custom-github-link"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
          aria-label="GitHub latest release"
          href={versionUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <svg width="20" height="20" viewBox="0 0 28 27" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M13.601 0a13.597 13.597 0 00-4.298 26.498c.676.126.928-.295.928-.655 0-.325-.011-1.394-.018-2.531-3.783.822-4.58-1.603-4.58-1.603-.619-1.576-1.51-1.99-1.51-1.99-1.234-.845.092-.827.092-.827 1.366.097 2.085 1.4 2.085 1.4 1.213 2.079 3.181 1.48 3.956 1.126.123-.878.475-1.477.864-1.817-3.01-.34-6.196-1.506-6.196-6.716a5.257 5.257 0 011.403-3.654c-.142-.342-.608-1.725.13-3.602 0 0 1.142-.365 3.74 1.393a12.92 12.92 0 016.81 0c2.585-1.749 3.736-1.393 3.736-1.393.739 1.873.275 3.255.133 3.602a5.255 5.255 0 011.398 3.65c0 5.223-3.18 6.371-6.207 6.71.486.42.92 1.249.92 2.516 0 1.82-.013 3.285-.013 3.731 0 .363.243.786.932.653A13.596 13.596 0 0013.601 0z"/>
            <path d="M5.154 19.52c-.03.068-.135.088-.225.043s-.156-.137-.124-.205c.031-.067.137-.087.225-.042.088.045.155.137.122.204h.002zm.551.615c-.065.06-.191.032-.279-.063a.207.207 0 01-.038-.281c.067-.061.189-.032.279.063.09.094.106.225.038.281zm.536.783c-.083.059-.225 0-.304-.117-.079-.117-.083-.265 0-.324.084-.058.225 0 .304.115.079.115.084.268 0 .326zm.743.757a.255.255 0 01-.358-.06c-.12-.111-.153-.266-.076-.348.076-.08.225-.06.35.052.127.113.154.266.075.347l.01.009zm1.004.439c-.033.106-.184.155-.34.11-.155-.045-.254-.17-.225-.279.03-.108.185-.157.34-.11.156.047.255.17.225.279zm1.112.081c0 .113-.126.205-.288.207-.162.002-.292-.085-.295-.198-.002-.113.126-.205.29-.207.165-.002.293.088.293.198zm1.036-.175c.02.11-.092.225-.252.252-.16.027-.304-.039-.324-.149-.02-.11.094-.225.252-.252.158-.027.304.038.324.148z"/>
          </svg>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span
              className="navbar__version-link"
              style={{
                transition:
                  "color 0.2s ease-in-out, text-decoration 0.2s ease-in-out",
                cursor: "pointer",
              }}
            >
              {version}
            </span>
            <span style={{ color: "#6b7280", margin: "0 4px" }}>|</span>
            <span
              style={{
                transition: "color 0.2s ease-in-out",
                color: "#9ca3af",
                fontSize: "15px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                pointerEvents: "none",
              }}
            >
              <svg className="navbar__star-count-icon" aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" style={{ fill: "#9ca3af", transform: "translateY(1px)", transition: "fill 0.2s ease-in-out" }}>
                <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z"></path>
              </svg>
              {starCount || "..."}
            </span>
            <ChevronDownIcon
              style={{ width: "12px", height: "12px", color: "#9ca3af", transition: "color 0.2s ease-in-out" }}
            />
          </span>
        </Link>
        <ul className="dropdown__menu" style={{ width: "170px", padding: "0.2rem 0.5rem" }}>
          <li>
            <Link
              to="https://questdb.com/release-notes"
              target="_self"
              className="dropdown__link font-semibold"
            >
              Release Notes
            </Link>
          </li>
          <li>
            <Link
              to="https://github.com/orgs/questdb/projects/1/views/5"
              className="dropdown__link font-semibold"
              target="_blank"
            >
              Roadmap
            </Link>
          </li>
        </ul>
      </div>
    </>
  )
}
