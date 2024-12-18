const githubOrgUrl = "https://github.com/questdb"
const domain = "questdb.com"

module.exports = {
  trailingSlash: undefined,
  artifactHubUrl: "https://artifacthub.io/packages/helm/questdb/questdb",
  copyright: `Copyright © ${new Date().getFullYear()} QuestDB`,
  crunchbaseUrl: "https://www.crunchbase.com/organization/quest-db",
  defaultCta: "Download QuestDB",
  demoUrl: `https://demo.${domain}`,
  description:
    "QuestDB is the world's fastest growing open-source time-series database. It offers massive ingestion throughput, millisecond queries, powerful time-series SQL extensions, and scales well with minimal and maximal hardware. Save costs with better performance and efficiency.",
  dockerUrl: "https://hub.docker.com/r/questdb/questdb",
  domain,
  docIssueTemplate: `${githubOrgUrl}/questdb/issues/new/choose`,
  githubOrgUrl,
  githubUrl: `${githubOrgUrl}/questdb`,
  websiteGithubUrl: `${githubOrgUrl}/questdb.io`,
  linkedInUrl: "https://www.linkedin.com/company/questdb/",
  oneLiner: "QuestDB: the database for time series",
  slackUrl: `https://slack.${domain}`,
  discourseUrl: `https://community.${domain}`,
  stackoverflowUrl: "https://stackoverflow.com/questions/tagged/questdb",
  twitterUrl: "https://x.com/questdb",
  xUrl: "https://x.com/questdb",
  videosUrl: "https://www.youtube.com/c/QuestDB",
  redditUrl: "https://www.reddit.com/r/questdb",
  cloudUrl: "https://cloud.questdb.com/",
  defaultLeadIn: `
  QuestDB is the world's fastest growing
  <a href="/glossary/time-series-database/">time-series database</a>.
  It offers premium ingestion throughput, enhanced SQL analytics
  that can power through analysis, and cost-saving hardware efficiency. It's
  <a href='https://github.com/questdb/questdb'>open source</a>
  and integrates with many tools and languages.`,
  financeLeadIn: `QuestDB is a next-generation
  database for <a href="/market-data/">market data</a>. It offers premium ingestion throughput,
  enhanced SQL analytics that can power through analysis, and cost-saving hardware efficiency. It's
  <a href='https://github.com/questdb/questdb'>open source</a>, applies open formats, and is ideal for <a href="/glossary/tick-data/">tick data</a>.`,
}
