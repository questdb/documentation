import React from "react"
import CodeBlock from "@theme/CodeBlock"
import { usePluginData } from "@docusaurus/useGlobalData"

const InsertDataJava = () => {
  const { release } = usePluginData<{ release: { name: string } }>(
    "fetch-java-client-release",
  )
  const version = release.name

  return (
    <CodeBlock className="language-java">
      {`
import io.questdb.client.Sender;

public class LineTCPSenderMain {
/*
    Maven:

            <dependency>
                <groupId>org.questdb</groupId>
                <artifactId>questdb-client</artifactId>
                <version>${version}</version>
            </dependency>

        Gradle:

            implementation 'org.questdb:questdb-client:${version}'

     */
    public static void main(String[] args) {
        try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;")) {
            sender.table("trades")
                    .symbol("name", "test_ilp1")
                    .doubleColumn("value", 12.4)
                    .atNow();
            sender.table("trades")
                    .symbol("name", "test_ilp2")
                    .doubleColumn("value", 11.4)
                    .atNow();
        }
    }
}
      `}
    </CodeBlock>
  )
}

export default InsertDataJava
