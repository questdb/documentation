import type { Content, FrontMatter, Metadata } from "@theme/BlogPostPage"

export enum FeatureType {
  RESOURCE = "resource",
  COMPARISON = "comparison",
}

type FlatTutorial = FrontMatter &
  Readonly<{
    content: string
    date: string
    link: string
    featureType?: FeatureType
  }>

const tutorials: FlatTutorial[] = [
  {
    author: "Kovid Rathee",
    date: "2021-01-11",
    content:
      "A short hands-on tutorial on how to use SQL extensions built for time-series data in QuestDB.",
    link: "https://towardsdatascience.com/sql-extensions-for-time-series-data-in-questdb-f6b53acf3213",
    title: "SQL Extensions for Time-Series Data in QuestDB",
    featureType: FeatureType.RESOURCE,
    image: "/images/tutorial/shared/og-sql.webp",
  },
  {
    author: "Kovid Rathee",
    date: "2020-12-17",
    content:
      "How to ingest schemaless data into QuestDB from Python using QuestDB's InfluxDB line protocol support.",
    link: "https://towardsdatascience.com/schemaless-ingestion-in-questdb-using-influxdb-line-protocol-18850e69b453?gi=113183e2c22b",
    title: "Schemaless ingestion in QuestDB using InfluxDB Line Protocol",
    featureType: FeatureType.RESOURCE,
    image: "/images/tutorial/shared/og-influx-line-protocol.webp",
  },
  {
    author: "David G. Simmons",
    date: "2020-08-25",
    content:
      "In this video, David describes why a performant time-series database is critical for IoT use cases and shows how to set up and use QuestDB for ingesting sensor data from Arduino boards.",
    link: "https://www.youtube.com/watch?v=5IsPIpcVCoE",
    image: "/images/tutorial/shared/og-youtube.webp",
    title: "Sending IoT Data from Arduino to QuestDB",
  },
  {
    author: "David McKay",
    date: "2020-08-24",
    content:
      "How to setup QuestDB with Kubernetes and write data using the InfluxDB line protocol ingestion feature.",
    link: "https://rawkode.com/articles/questdb-on-kubernetes/",
    image: "/images/tutorial/shared/og-kubernetes.webp",
    title: "QuestDB on Kubernetes",
  },
  {
    author: "David G. Simmons",
    date: "2020-08-13",
    content:
      "How do you get the most out of your IoT data? Listen and watch as David Simmons answers this question and more during this Virtual Lunch & Learn session!",
    link: "https://www.youtube.com/watch?v=RseiLoBRcAg",
    image: "/images/tutorial/shared/og-youtube.webp",
    title: "QuestDB virtual lunch and learn",
  },
  {
    author: "David G. Simmons",
    date: "2020-06-26",
    content:
      "It's one thing to send data to your database, but being able to visualize that data is the next logical step. So let's dive right into doing that.",
    link: "https://dev.to/davidgs/a-questdb-dashboard-with-node-red-524h",
    title: "A QuestDB Dashboard with Node-Red",
  },
  {
    author: "David G. Simmons",
    date: "2020-06-19",
    content:
      "In this video, David shows how to set up QuestDB on a Raspberry Pi and ingest and query IoT sensor data.",
    link: "https://www.youtube.com/watch?v=wjkDbgi_mec",
    image: "/images/tutorial/shared/og-youtube.webp",
    title: "Running QuestDB on Raspberry Pi and K8s Networking",
  },
  {
    author: "Michael Beale",
    date: "2020-05-20",
    content:
      "In this tutorial, Michael Beale writes about how he managed to simplify his ETL pipeline",
    link: "https://towardsdatascience.com/bypassing-pandas-memory-limitations-9abb574fdf76",
    image: "/images/tutorial/shared/og-pandas.webp",
    title: "Bypassing Pandas Memory Limitations",
  },
]

export type Tutorial = Readonly<{
  content: Readonly<{
    frontMatter: Omit<FlatTutorial, "link" | "date"> & { description?: string }
    metadata: Omit<Metadata, "title" | "tags"> & { truncated?: string }
    toc?: Content["toc"]
  }>
  external: true
}>

const normalize = (data: FlatTutorial[]): Tutorial[] =>
  data.map(({ author, content, date, featureType, image, link, title }) => ({
    content: {
      frontMatter: {
        author,
        content,
        featureType,
        image,
        title,
      },
      metadata: {
        date,
        formattedDate: date.toString(), // TODO format date
        permalink: link,
        truncated: "true",
      },
    },
    external: true,
  }))

export default normalize(tutorials)
