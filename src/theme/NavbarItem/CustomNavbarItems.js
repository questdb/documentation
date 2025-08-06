import Link from "@docusaurus/Link"
import React from "react"
import { usePluginData } from "@docusaurus/useGlobalData"
import { ChevronDownIcon, StarIcon } from "@heroicons/react/24/outline"

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
      <div className="navbar__item dropdown dropdown--hoverable dropdown--left min-w-fit">
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
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                transition:
                  "color 0.2s ease-in-out, text-decoration 0.2s ease-in-out",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--ifm-color-primary-lighter)"
                e.currentTarget.style.textDecoration = "underline"
                e.currentTarget.style.textDecorationColor =
                  "var(--ifm-color-primary-lighter)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--palette-white)"
                e.currentTarget.style.textDecoration = "none"
              }}
            >
              {version}
            </span>
            <span style={{ color: "#6b7280", margin: "0 4px" }}>|</span>
            <span
              style={{
                color: "#9ca3af",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                pointerEvents: "none",
              }}
            >
              <StarIcon style={{ width: "12px", height: "12px" }} />
              {starCount || "..."}
            </span>
            <ChevronDownIcon
              style={{ width: "12px", height: "12px", color: "#9ca3af" }}
            />
          </span>
        </Link>
        <ul className="dropdown__menu">
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
