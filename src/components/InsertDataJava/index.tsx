import React from "react"
import CodeBlock from "@theme/CodeBlock"

const InsertDataJava = () => {
  return (
    <CodeBlock className="language-java">
      {`
import io.questdb.cutlass.line.LineTcpSender;
import io.questdb.network.Net;
import io.questdb.std.Os;

public class LineTCPSenderMain {
/*
    Maven:

            <dependency>
                <groupId>org.questdb</groupId>
                <artifactId>questdb-client</artifactId>
                <version>1.0.1</version>
            </dependency>

        Gradle:

            implementation 'org.questdb:client:1.0.0'

     */
    public static void main(String[] args) {
        String hostIPv4 = "127.0.0.1";
        int port = 9009;
        int bufferCapacity = 256 * 1024;

        try (LineTcpSender sender = new LineTcpSender(Net.parseIPv4(hostIPv4), port, bufferCapacity)) {
            sender
                    .metric("trades")
                    .tag("name", "test_ilp1")
                    .field("value", 12.4)
                    .$(Os.currentTimeNanos());
            sender
                    .metric("trades")
                    .tag("name", "test_ilp2")
                    .field("value", 11.4)
                    .$(Os.currentTimeNanos());

            sender.flush();
        }
    }
}
      `}
    </CodeBlock>
  )
}

export default InsertDataJava
