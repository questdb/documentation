module.exports = {
  docs: [
    {
      id: "introduction",
      type: "doc",
    },
    {
      id: "quick-start",
      type: "doc",
      customProps: { tag: "Popular" },
    },
    {
      id: "guides/influxdb-migration",
      type: "doc",
      customProps: { tag: "Popular" },
    },
    {
      type: "category",
      label: "Ingestion Reference",
      items: [
        {
          id: "ingestion-overview",
          type: "doc",
          label: "Overview",
        },
        {
          type: "category",
          label: "Language Clients",
          collapsed: false,
          items: [
            {
              id: "configuration-string",
              type: "doc",
              label: "Configuration string",
            },
            {
              id: "clients/ingest-python",
              type: "doc",
              label: "Python",
            },
            {
              id: "clients/ingest-go",
              type: "doc",
              label: "Go",
            },
            {
              id: "clients/java_ilp",
              type: "doc",
              label: "Java",
            },
            {
              id: "clients/ingest-rust",
              type: "doc",
              label: "Rust",
            },
            {
              id: "clients/ingest-node",
              type: "doc",
              label: "Node.js",
            },
            {
              id: "clients/ingest-c-and-cpp",
              type: "doc",
              label: "C & C++",
            },
            {
              id: "clients/ingest-dotnet",
              type: "doc",
              label: ".NET",
            },
            {
              id: "clients/date-to-timestamp-conversion",
              type: "doc",
              label: "Date to Timestamp Conversion",
            },
          ],
        },
        {
          type: "category",
          label: "Message Brokers",
          collapsed: false,
          items: [
            {
              label: "Kafka",
              type: "category",
              items: [
                "third-party-tools/kafka/overview",
                "third-party-tools/kafka/questdb-kafka",
              ],
            },
            "third-party-tools/telegraf",
            "third-party-tools/redpanda",
            "third-party-tools/flink",
          ],
        },
        {
          type: "category",
          label: "Protocols",
          items: [
            {
              type: "category",
              label: "InfluxDB Line Protocol (ILP)",
              items: [
                "reference/api/ilp/overview",
                "reference/api/ilp/advanced-settings",
                "reference/api/ilp/columnset-types",
              ],
            },
            "reference/api/postgres",
            "reference/api/rest",
          ],
        },
      ],
    },
    {
      type: "category",
      label: "Query & SQL Reference",
      items: [
        "reference/sql/overview",
        "reference/sql/datatypes",
        "concept/sql-execution-order",
        {
          type: "category",
          label: "SQL Syntax",
          items: [
            {
              id: "reference/sql/acl/add-user",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            {
              id: "reference/sql/acl/alter-service-account",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            {
              type: "category",
              label: "ALTER COLUMN",
              items: [
                "reference/sql/alter-table-alter-column-add-index",
                "reference/sql/alter-table-alter-column-cache",
                "reference/sql/alter-table-alter-column-drop-index",
                "reference/sql/alter-table-change-column-type",
              ],
            },
            {
              type: "category",
              label: "ALTER TABLE",
              items: [
                "reference/sql/alter-table-add-column",
                "reference/sql/alter-table-attach-partition",
                "reference/sql/alter-table-change-column-type",
                "reference/sql/alter-table-detach-partition",
                "reference/sql/alter-table-disable-deduplication",
                "reference/sql/alter-table-drop-column",
                "reference/sql/alter-table-drop-partition",
                "reference/sql/alter-table-enable-deduplication",
                "reference/sql/alter-table-rename-column",
                "reference/sql/alter-table-resume-wal",
                "reference/sql/alter-table-set-param",
                "reference/sql/alter-table-set-type",
                "reference/sql/alter-table-squash-partitions",
              ],
            },
            {
              id: "reference/sql/acl/alter-user",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            "reference/sql/asof-join",
            {
              id: "reference/sql/acl/assume-service-account",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            "reference/sql/cancel-query",
            "reference/sql/case",
            "reference/sql/cast",
            "reference/sql/checkpoint",
            "reference/sql/copy",
            "reference/sql/create-table",
            {
              id: "reference/sql/acl/create-group",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            {
              id: "reference/sql/acl/create-service-account",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            {
              id: "reference/sql/acl/create-user",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            "reference/sql/distinct",
            "reference/sql/drop",
            {
              id: "reference/sql/acl/drop-group",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            {
              id: "reference/sql/acl/drop-service-account",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            {
              id: "reference/sql/acl/drop-user",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            "reference/sql/explain",
            {
              id: "reference/sql/acl/exit-service-account",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            "reference/sql/fill",
            "reference/sql/group-by",
            {
              id: "reference/sql/acl/grant",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            {
              id: "reference/sql/acl/grant-assume-service-account",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            "reference/sql/insert",
            "reference/sql/join",
            "reference/sql/latest-on",
            "reference/sql/limit",
            "reference/sql/order-by",
            "reference/sql/reindex",
            "reference/sql/rename",
            {
              id: "reference/sql/acl/remove-user",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            "reference/sql/sample-by",
            "reference/sql/select",
            "reference/sql/show",
            "reference/sql/snapshot",
            {
              id: "reference/sql/acl/revoke",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            {
              id: "reference/sql/acl/revoke-assume-service-account",
              type: "doc",
              customProps: { tag: "Enterprise" },
            },
            "reference/sql/truncate",
            "reference/sql/union-except-intersect",
            "reference/sql/update",
            "reference/sql/vacuum-table",
            "reference/sql/where",
            "reference/sql/with",
          ],
        },
        {
          type: "category",
          label: "Functions",
          items: [
            "reference/function/aggregation",
            "reference/function/binary",
            "reference/function/boolean",
            "reference/function/conditional",
            "reference/function/date-time",
            "reference/function/finance",
            "reference/function/meta",
            "reference/function/numeric",
            "reference/function/parquet",
            "reference/function/pattern-matching",
            "reference/function/random-value-generator",
            "reference/function/row-generator",
            "reference/function/spatial",
            "reference/function/text",
            "reference/function/json",
            "reference/function/timestamp-generator",
            "reference/function/timestamp",
            "reference/function/touch",
            "reference/function/trigonometric",
            "reference/function/uuid",
            "reference/function/window",
          ],
        },
        {
          type: "category",
          label: "Operators",
          items: [
            "reference/operators/bitwise",
            "reference/operators/comparison",
            "reference/operators/date-time",
            "reference/operators/ipv4",
            "reference/operators/logical",
            "reference/operators/misc",
            "reference/operators/numeric",
            "reference/operators/precedence",
            "reference/operators/spatial",
            "reference/operators/text",
          ],
        },
      ],
    },
    {
      label: "Deployment & Operations",
      type: "category",
      items: [
        {
          type: "category",
          label: "Enterprise",
          collapsed: false,
          items: [
            {
              id: "operations/openid-connect-oidc-integration",
              type: "doc",
              label: "OpenID Connect (OIDC)",
              customProps: { tag: "Enterprise" },
            },
            {
              type: "doc",
              id: "operations/replication",
              customProps: { tag: "Enterprise" },
            },
            {
              type: "doc",
              id: "operations/rbac",
              customProps: { tag: "Enterprise" },
            },
            {
              type: "doc",
              id: "operations/tls",
              customProps: { tag: "Enterprise" },
            },
          ],
        },
        "operations/backup",
        "deployment/capacity-planning",
        "reference/command-line-options",
        {
          id: "configuration",
          type: "doc",
        },
        "operations/data-retention",
        {
          label: "Deployment Options",
          type: "category",
          items: [
            "deployment/aws-official-ami",
            "deployment/digitalocean",
            "deployment/docker",
            "deployment/google-cloud-platform",
            "deployment/kubernetes",
            "deployment/microsoft-azure-ubuntu",
            "deployment/systemd",
          ],
        },
        "operations/design-for-performance",
        "operations/logging-metrics",
        "operations/updating-data",
      ],
    },
    {
      label: "Guides & Tutorials",
      type: "category",
      items: [
        {
          id: "guides/active-directory-pingfederate",
          label: "Active Directory",
          type: "doc",
          customProps: { tag: "Enterprise" },
        },
        "guides/create-database",
        {
          id: "guides/enterprise-quick-start",
          type: "doc",
          customProps: { tag: "Enterprise" },
        },
        "guides/compression-zfs",
        "reference/api/java-embedded",
        "guides/import-csv",
        "guides/modifying-data",
        "guides/replication-tuning",
        "guides/working-with-timestamps-timezones",
        "web-console",
        {
          label: "Blog tutorials 🔗",
          type: "link",
          href: "/blog/tags/tutorial",
        },
      ],
    },
    {
      label: "Concepts",
      type: "category",
      items: [
        "concept/write-ahead-log",
        "concept/storage-model",
        "concept/designated-timestamp",
        "concept/deduplication",
        {
          customProps: {
            tag: "Enterprise",
          },
          type: "doc",
          id: "concept/replication",
        },
        "concept/sql-extensions",
        "concept/jit-compiler",
        "concept/partitions",
        "concept/symbol",
        "concept/indexes",
        "concept/interval-scan",
        "concept/geohashes",
        "concept/root-directory-structure",
      ],
    },
    {
      label: "Third-party Tools",
      type: "category",
      items: [
        {
          type: "doc",
          id: "third-party-tools/overview",
        },
        "third-party-tools/airbyte",
        "third-party-tools/cube",
        "third-party-tools/databento",
        "third-party-tools/embeddable",
        "third-party-tools/flink",
        "third-party-tools/grafana",
        {
          label: "Kafka",
          type: "category",
          items: [
            "third-party-tools/kafka/overview",
            "third-party-tools/kafka/questdb-kafka",
          ],
        },
        "third-party-tools/mindsdb",
        "third-party-tools/pandas",
        "third-party-tools/prometheus",
        "third-party-tools/qstudio",
        "third-party-tools/redpanda",
        "third-party-tools/redpanda-connect",
        "third-party-tools/spark",
        "third-party-tools/sqlalchemy",
        "third-party-tools/superset",
        "third-party-tools/telegraf",
      ],
    },
    {
      label: "Troubleshooting",
      type: "category",
      items: [
        "troubleshooting/faq",
        "troubleshooting/log",
        "troubleshooting/os-error-codes",
      ],
    },
  ].filter(Boolean),
};
