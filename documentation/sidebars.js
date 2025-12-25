module.exports = {
  docs: [
    "introduction",
    "why-questdb",
    "guides/schema-design-essentials",

    // ===================
    // GETTING STARTED
    // ===================
    {
      type: "category",
      label: "Getting Started",
      collapsed: true,
      items: [
        "quick-start",
        "operations/capacity-planning",
        "guides/create-database",
        {
          id: "operations/migrate-to-enterprise",
          type: "doc",
          label: "Upgrade to Enterprise",
        },
        {
          id: "guides/enterprise-quick-start",
          type: "doc",
          label: "Enterprise Quick Start",
        },
        {
          type: "category",
          label: "Web Console",
          collapsed: true,
          items: [
            "web-console",
            "web-console/code-editor",
            "web-console/metrics-view",
            "web-console/schema-explorer",
            "web-console/result-grid",
            "web-console/query-log",
            "web-console/import-csv",
            "web-console/create-table",
          ],
        },
      ],
    },

    // ===================
    // INGESTION REFERENCE
    // ===================
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
          collapsed: true,
          items: [
            {
              id: "configuration-string",
              type: "doc",
              label: "Configuration String",
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
              id: "clients/java-ilp",
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
              label: "Date to Timestamp",
            },
          ],
        },
        {
          type: "category",
          label: "Message Brokers",
          collapsed: true,
          items: [
            "third-party-tools/kafka",
            "third-party-tools/telegraf",
            "third-party-tools/redpanda",
            "third-party-tools/flink",
          ],
        },
        {
          type: "category",
          label: "Protocols",
          collapsed: true,
          items: [
            {
              type: "category",
              label: "InfluxDB Line Protocol (ILP)",
              items: [
                {
                  id: "reference/api/ilp/overview",
                  type: "doc",
                  label: "Overview",
                },
                {
                  id: "reference/api/ilp/columnset-types",
                  type: "doc",
                  label: "Columnset Types",
                },
                {
                  id: "reference/api/ilp/advanced-settings",
                  type: "doc",
                  label: "Advanced Settings",
                },
              ],
            },
            {
              id: "reference/api/java-embedded",
              type: "doc",
              label: "Java Embedded",
            },
          ],
        },
      ],
    },

    // ===================
    // QUERY & SQL REFERENCE
    // ===================
    {
      type: "category",
      label: "Query & SQL Reference",
      items: [
        "reference/sql/overview",
        {
          type: "category",
          label: "PostgreSQL Wire Protocol",
          collapsed: true,
          items: [
            {
              id: "pgwire/pgwire-intro",
              type: "doc",
              label: "Overview",
            },
            {
              id: "pgwire/python",
              type: "doc",
              label: "Python",
            },
            {
              id: "pgwire/go",
              type: "doc",
              label: "Go",
            },
            {
              id: "pgwire/java",
              type: "doc",
              label: "Java",
            },
            {
              id: "pgwire/rust",
              type: "doc",
              label: "Rust",
            },
            {
              id: "pgwire/javascript",
              type: "doc",
              label: "Node.js",
            },
            {
              id: "pgwire/c-sharp",
              type: "doc",
              label: ".NET",
            },
            {
              id: "pgwire/php",
              type: "doc",
              label: "PHP",
            },
            {
              id: "pgwire/rpostgres",
              type: "doc",
              label: "R",
            },
            {
              id: "pgwire/c-and-cpp",
              type: "doc",
              label: "C/C++",
            },
          ],
        },
        "reference/api/rest",
        {
          type: "category",
          label: "Data Types",
          collapsed: true,
          items: [
            {
              id: "reference/sql/datatypes",
              type: "doc",
              label: "Overview",
            },
            "concept/array",
            "concept/decimal",
            "concept/geohashes",
          ],
        },
        {
          type: "category",
          label: "SQL Syntax",
          collapsed: true,
          items: [
            {
              id: "reference/sql/acl/add-user",
              type: "doc",
                },
            {
              type: "category",
              label: "ALTER",
              items: [
                {
                  type: "category",
                  label: "ALTER COLUMN (TABLE)",
                  items: [
                    "reference/sql/alter-table-alter-column-add-index",
                    "reference/sql/alter-table-alter-column-cache",
                    "reference/sql/alter-table-change-column-type",
                    "reference/sql/alter-table-alter-column-drop-index",
                    "reference/sql/alter-table-change-symbol-capacity",
                  ],
                },
                {
                  type: "category",
                  label: "ALTER COLUMN (VIEW)",
                  items: [
                    "reference/sql/alter-mat-view-alter-column-add-index",
                    "reference/sql/alter-mat-view-alter-column-drop-index",
                  ],
                },
                {
                  id: "reference/sql/acl/alter-service-account",
                  type: "doc",
                        },
                {
                  type: "category",
                  label: "ALTER TABLE",
                  items: [
                    "reference/sql/alter-table-add-column",
                    "reference/sql/alter-table-attach-partition",
                    "reference/sql/alter-table-change-column-type",
                    "reference/sql/alter-table-enable-deduplication",
                    "reference/sql/alter-table-disable-deduplication",
                    "reference/sql/alter-table-detach-partition",
                    "reference/sql/alter-table-drop-column",
                    "reference/sql/alter-table-drop-partition",
                    "reference/sql/alter-table-rename-column",
                    "reference/sql/alter-table-resume-wal",
                    "reference/sql/alter-table-set-param",
                    "reference/sql/alter-table-set-ttl",
                    "reference/sql/alter-table-set-type",
                    "reference/sql/alter-table-squash-partitions",
                    "reference/sql/alter-table-change-symbol-capacity",
                  ],
                },
                {
                  type: "category",
                  label: "ALTER MATERIALIZED VIEW",
                  items: [
                    "reference/sql/alter-mat-view-resume-wal",
                    "reference/sql/alter-mat-view-set-refresh",
                    "reference/sql/alter-mat-view-set-refresh-limit",
                    "reference/sql/alter-mat-view-set-ttl",
                    "reference/sql/alter-mat-view-change-symbol-capacity",
                  ],
                },
                {
                  id: "reference/sql/acl/alter-user",
                  type: "doc",
                        },
                "reference/sql/alter-view",
              ],
            },
            {
              id: "reference/sql/acl/assume-service-account",
              type: "doc",
                },
            "reference/sql/cancel-query",
            "reference/sql/checkpoint",
            "reference/sql/compile-view",
            "reference/sql/copy",
            {
              type: "category",
              label: "CREATE",
              items: [
                {
                  id: "reference/sql/acl/create-group",
                  type: "doc",
                        },
                "reference/sql/create-mat-view",
                {
                  id: "reference/sql/acl/create-service-account",
                  type: "doc",
                        },
                "reference/sql/create-table",
                {
                  id: "reference/sql/acl/create-user",
                  type: "doc",
                        },
                "reference/sql/create-view",
              ],
            },
            {
              type: "category",
              label: "DROP",
              items: [
                {
                  id: "reference/sql/acl/drop-group",
                  type: "doc",
                        },
                "reference/sql/drop-mat-view",
                {
                  id: "reference/sql/acl/drop-service-account",
                  type: "doc",
                        },
                "reference/sql/drop",
                {
                  id: "reference/sql/acl/drop-user",
                  type: "doc",
                        },
                "reference/sql/drop-view",
              ],
            },
            {
              id: "reference/sql/acl/exit-service-account",
              type: "doc",
                },
            "reference/sql/explain",
            {
              type: "category",
              label: "GRANT",
                  items: [
                {
                  id: "reference/sql/acl/grant",
                  type: "doc",
                },
                {
                  id: "reference/sql/acl/grant-assume-service-account",
                  type: "doc",
                },
              ],
            },
            "reference/sql/insert",
            "reference/sql/refresh-mat-view",
            "reference/sql/reindex",
            {
              id: "reference/sql/acl/remove-user",
              type: "doc",
                },
            "reference/sql/rename",
            {
              type: "category",
              label: "REVOKE",
                  items: [
                {
                  id: "reference/sql/acl/revoke",
                  type: "doc",
                },
                {
                  id: "reference/sql/acl/revoke-assume-service-account",
                  type: "doc",
                },
              ],
            },
            {
              type: "category",
              label: "SELECT",
              items: [
                "reference/sql/select",
                "reference/sql/asof-join",
                "reference/sql/case",
                "reference/sql/cast",
                "reference/sql/declare",
                "reference/sql/distinct",
                "reference/sql/fill",
                "reference/sql/group-by",
                "reference/sql/join",
                "reference/sql/window-join",
                "reference/sql/latest-on",
                "reference/sql/limit",
                "reference/sql/order-by",
                "reference/sql/over",
                "reference/sql/sample-by",
                "reference/sql/where",
                "reference/sql/with",
              ],
            },
            "reference/sql/show",
            "reference/sql/snapshot",
            "reference/sql/truncate",
            "reference/sql/union-except-intersect",
            "reference/sql/update",
            "reference/sql/vacuum-table",
          ],
        },
        "concept/sql-execution-order",
        {
          type: "category",
          label: "Functions",
          items: [
            "reference/function/aggregation",
            "reference/function/array",
            "reference/function/binary",
            "reference/function/boolean",
            "reference/function/conditional",
            "reference/function/date-time",
            "reference/function/finance",
            "reference/function/hash",
            "reference/function/json",
            "reference/function/meta",
            "reference/function/numeric",
            "reference/function/parquet",
            "reference/function/pattern-matching",
            "reference/function/random-value-generator",
            "reference/function/row-generator",
            "reference/function/spatial",
            "reference/function/text",
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

    // ===================
    // CONCEPTS
    // ===================
    {
      label: "Concepts",
      type: "category",
      items: [
        {
          type: "category",
          label: "Core Concepts",
          collapsed: false,
          items: [
            "concept/designated-timestamp",
            "concept/partitions",
            "concept/symbol",
            {
              id: "concept/views",
              type: "doc",
              label: "Views",
            },
            {
              id: "concept/mat-views",
              type: "doc",
              label: "Materialized Views",
            },
            "concept/deduplication",
            "concept/ttl",
            "concept/write-ahead-log",
          ],
        },
        {
          type: "category",
          label: "Deep Dive",
          collapsed: true,
          items: [
            "concept/indexes",
            "concept/interval-scan",
            "concept/jit-compiler",
            "concept/query-tracing",
            "concept/sql-extensions",
            "concept/sql-optimizer-hints",
            "concept/root-directory-structure",
          ],
        },
      ],
    },

    // ===================
    // ARCHITECTURE
    // ===================
    {
      label: "Architecture",
      type: "category",
      items: [
        "guides/architecture/overview",
        "guides/architecture/storage-engine",
        "guides/architecture/memory-management",
        "guides/architecture/query-engine",
        "guides/architecture/time-series-optimizations",
        "guides/architecture/observability",
      ],
    },

    // ===================
    // CONFIGURATION
    // ===================
    {
      label: "Configuration",
      type: "category",
      items: [
        {
          id: "configuration",
          type: "doc",
          label: "Overview",
        },
        "operations/command-line-options",
      ],
    },

    // ===================
    // SECURITY
    // ===================
    {
      label: "Security",
      type: "category",
      items: [
        {
          id: "operations/rbac",
          type: "doc",
          label: "Role-Based Access Control (RBAC)",
        },
        {
          id: "operations/openid-connect-oidc-integration",
          type: "doc",
          label: "OpenID Connect (OIDC)",
        },
        {
          type: "doc",
          id: "operations/tls",
        },
      ],
    },

    // ===================
    // HIGH AVAILABILITY
    // ===================
    {
      label: "High Availability",
      type: "category",
      items: [
        {
          id: "concept/replication",
          type: "doc",
          label: "Overview",
        },
        {
          id: "operations/replication",
          type: "doc",
          label: "Setup Guide",
        },
        {
          id: "operations/multi-primary-ingestion",
          type: "doc",
          label: "Multi-primary Ingestion",
        },
        {
          id: "guides/replication-tuning",
          type: "doc",
          label: "Tuning",
        },
      ],
    },

    // ===================
    // OPERATIONS
    // ===================
    {
      label: "Operations",
      type: "category",
      items: [
        "operations/backup",
        "operations/logging-metrics",
        "operations/monitoring-alerting",
        "operations/data-retention",
        "operations/updating-data",
        "operations/task-automation",
      ],
    },

    // ===================
    // DEPLOYMENT
    // ===================
    {
      label: "Deployment",
      type: "category",
      items: [
        "deployment/docker",
        "deployment/kubernetes",
        "deployment/systemd",
        "deployment/aws",
        "deployment/azure",
        "deployment/gcp",
        "deployment/digital-ocean",
        "deployment/hetzner",
      ],
    },

    // ===================
    // INTEGRATIONS
    // ===================
    {
      label: "Integrations",
      type: "category",
      items: [
        {
          type: "doc",
          id: "third-party-tools/overview",
        },
        {
          type: "category",
          label: "Visualization",
          collapsed: false,
          items: [
            "third-party-tools/grafana",
            "third-party-tools/powerbi",
            "third-party-tools/superset",
            "third-party-tools/embeddable",
          ],
        },
        {
          type: "category",
          label: "Data Processing",
          collapsed: false,
          items: [
            "third-party-tools/pandas",
            "third-party-tools/polars",
            "third-party-tools/spark",
          ],
        },
        {
          type: "category",
          label: "Orchestration",
          collapsed: false,
          items: [
            "third-party-tools/airflow",
            "third-party-tools/dagster",
          ],
        },
        {
          type: "category",
          label: "Other Tools",
          collapsed: false,
          items: [
            "third-party-tools/prometheus",
            "third-party-tools/ignition",
            "third-party-tools/qstudio",
            "third-party-tools/sqlalchemy",
            "third-party-tools/mindsdb",
            "third-party-tools/cube",
            "third-party-tools/databento",
            "third-party-tools/airbyte",
          ],
        },
      ],
    },

    // ===================
    // TUTORIALS
    // ===================
    {
      label: "Tutorials",
      type: "category",
      items: [
        "guides/import-csv",
        "guides/working-with-timestamps-timezones",
        "guides/compression-zfs",
        "guides/export-parquet",
        "guides/modifying-data",
        {
          id: "guides/order-book",
          label: "Order Book Analytics",
          type: "doc",
        },
        "guides/influxdb-migration",
        {
          label: "Blog Tutorials",
          type: "link",
          href: "https://questdb.com/blog/?tag=tutorial",
        },
      ],
    },

    // ===================
    // TROUBLESHOOTING
    // ===================
    {
      label: "Troubleshooting",
      type: "category",
      items: [
        "troubleshooting/faq",
        "operations/profiling",
        "troubleshooting/os-error-codes",
        "troubleshooting/error-codes",
      ],
    },

    // ===================
    // RELEASE NOTES
    // ===================
    {
      label: "Release Notes",
      type: "link",
      href: "https://questdb.com/release-notes",
    },
  ].filter(Boolean),
}
