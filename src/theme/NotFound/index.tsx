import React from "react"
import Layout from "../Layout"
import { Section } from "../../components/Section"
import SearchBar from "@theme/SearchBar"
import Link from "@docusaurus/Link"
import styles from "./styles.module.css"

const NotFound = ({ location }) => {
  const missingLink = location.pathname.replace("/", "")

  return (
    <Layout title="Page not found">
      <Section>
        <Section.Title size="small">404 not found</Section.Title>

        <Section.Subtitle>
          Couldn&apos;t find page{" "}
          <code className={styles.missingLink}>{missingLink}</code>
        </Section.Subtitle>

        <div className={styles.search}>
          <SearchBar />
        </div>

        <div>
          <Section.Subtitle>Other pages</Section.Subtitle>
          <ul className={styles.otherContentLinks}>
            {[
              { to: "/docs/", label: "What is QuestDB?" },
              { to: "/download/", label: "Download QuestDB" },
              { to: "/enterprise/", label: "QuestDB Enterprise" },
              { to: "/blog/", label: "Read our Blog" },
              { to: "/docs/", label: "Read our Docs" },
              {
                to: "/glossary/time-series-database/",
                label: "What is a time-series database?",
              },
            ].map(({ to, label }) => (
              <li key={to}>
                <Link to={to}>{label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </Layout>
  )
}

export default NotFound
