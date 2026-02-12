module.exports = {
  docs: [
    "introduction",
    "schema-design-essentials",

    // ===================
    // GETTING STARTED
    // ===================
    {
      type: "category",
      label: "Getting Started",
      collapsed: true,
      items: [
        "getting-started/quick-start",
        "getting-started/llm-coding-assistants",
        "getting-started/capacity-planning",
        "getting-started/create-database",
        {
          id: "getting-started/migrate-to-enterprise",
          type: "doc",
          label: "Upgrade to QuestDB Enterprise",
        },
        {
          id: "getting-started/enterprise-quick-start",
          type: "doc",
          label: "QuestDB Enterprise Quick Start",
        },
        {
          type: "category",
          label: "Web Console",
          collapsed: true,
          items: [
            "getting-started/web-console/overview",
            "getting-started/web-console/code-editor",
            "getting-started/web-console/questdb-ai",
            "getting-started/web-console/metrics-view",
            "getting-started/web-console/schema-explorer",
            "getting-started/web-console/result-grid",
            "getting-started/web-console/query-log",
            "getting-started/web-console/import-csv",
            "getting-started/web-console/create-table",
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
          id: "ingestion/overview",
          type: "doc",
          label: "Overview",
        },
        {
          type: "category",
          label: "Language Clients",
          collapsed: true,
          items: [
            {
              id: "ingestion/clients/configuration-string",
              type: "doc",
              label: "Configuration String",
            },
            {
              id: "ingestion/clients/python",
              type: "doc",
              label: "Python",
            },
            {
              id: "ingestion/clients/go",
              type: "doc",
              label: "Go",
            },
            {
              id: "ingestion/clients/java",
              type: "doc",
              label: "Java",
            },
            {
              id: "ingestion/clients/rust",
              type: "doc",
              label: "Rust",
            },
            {
              id: "ingestion/clients/nodejs",
              type: "doc",
              label: "Node.js",
            },
            {
              id: "ingestion/clients/c-and-cpp",
              type: "doc",
              label: "C & C++",
            },
            {
              id: "ingestion/clients/dotnet",
              type: "doc",
              label: ".NET",
            },
            {
              id: "ingestion/clients/date-to-timestamp-conversion",
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
            "ingestion/message-brokers/kafka",
            "ingestion/message-brokers/telegraf",
            "ingestion/message-brokers/redpanda",
            "ingestion/message-brokers/flink",
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
                  id: "ingestion/ilp/overview",
                  type: "doc",
                  label: "Overview",
                },
                {
                  id: "ingestion/ilp/columnset-types",
                  type: "doc",
                  label: "Columnset Types",
                },
                {
                  id: "ingestion/ilp/advanced-settings",
                  type: "doc",
                  label: "Advanced Settings",
                },
              ],
            },
            {
              id: "ingestion/java-embedded",
              type: "doc",
              label: "Java Embedded",
            },
          ],
        },
        "ingestion/import-csv",
      ],
    },

    // ===================
    // QUERY & SQL REFERENCE
    // ===================
    {
      type: "category",
      label: "Query & SQL Reference",
      items: [
        "query/overview",
        {
          type: "category",
          label: "PostgreSQL Wire Protocol",
          collapsed: true,
          items: [
            {
              id: "query/pgwire/overview",
              type: "doc",
              label: "Overview",
            },
            {
              id: "query/pgwire/large-result-sets",
              type: "doc",
              label: "Large Result Sets",
            },
            {
              id: "query/pgwire/python",
              type: "doc",
              label: "Python",
            },
            {
              id: "query/pgwire/go",
              type: "doc",
              label: "Go",
            },
            {
              id: "query/pgwire/java",
              type: "doc",
              label: "Java",
            },
            {
              id: "query/pgwire/rust",
              type: "doc",
              label: "Rust",
            },
            {
              id: "query/pgwire/nodejs",
              type: "doc",
              label: "Node.js",
            },
            {
              id: "query/pgwire/dotnet",
              type: "doc",
              label: ".NET",
            },
            {
              id: "query/pgwire/php",
              type: "doc",
              label: "PHP",
            },
            {
              id: "query/pgwire/r",
              type: "doc",
              label: "R",
            },
            {
              id: "query/pgwire/c-and-cpp",
              type: "doc",
              label: "C/C++",
            },
          ],
        },
        "query/rest-api",
        "query/export-parquet",
        {
          type: "category",
          label: "Data Types",
          collapsed: true,
          items: [
            {
              id: "query/datatypes/overview",
              type: "doc",
              label: "Overview",
            },
            "query/datatypes/array",
            "query/datatypes/decimal",
            "query/datatypes/geohashes",
          ],
        },
        {
          type: "category",
          label: "SQL Syntax",
          collapsed: true,
          items: [
            {
              id: "query/sql/acl/add-user",
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
                    "query/sql/alter-table-alter-column-add-index",
                    "query/sql/alter-table-alter-column-cache",
                    "query/sql/alter-table-change-column-type",
                    "query/sql/alter-table-alter-column-drop-index",
                    "query/sql/alter-table-change-symbol-capacity",
                  ],
                },
                {
                  type: "category",
                  label: "ALTER COLUMN (MAT VIEW)",
                  items: [
                    "query/sql/alter-mat-view-alter-column-add-index",
                    "query/sql/alter-mat-view-alter-column-drop-index",
                  ],
                },
                {
                  id: "query/sql/acl/alter-service-account",
                  type: "doc",
                        },
                {
                  type: "category",
                  label: "ALTER TABLE",
                  items: [
                    "query/sql/alter-table-add-column",
                    "query/sql/alter-table-attach-partition",
                    "query/sql/alter-table-change-column-type",
                    "query/sql/alter-table-enable-deduplication",
                    "query/sql/alter-table-disable-deduplication",
                    "query/sql/alter-table-detach-partition",
                    "query/sql/alter-table-drop-column",
                    "query/sql/alter-table-drop-partition",
                    "query/sql/alter-table-rename-column",
                    "query/sql/alter-table-resume-wal",
                    "query/sql/alter-table-set-param",
                    "query/sql/alter-table-set-ttl",
                    "query/sql/alter-table-set-type",
                    "query/sql/alter-table-squash-partitions",
                    "query/sql/alter-table-change-symbol-capacity",
                  ],
                },
                {
                  type: "category",
                  label: "ALTER MATERIALIZED VIEW",
                  items: [
                    "query/sql/alter-mat-view-resume-wal",
                    "query/sql/alter-mat-view-set-refresh",
                    "query/sql/alter-mat-view-set-refresh-limit",
                    "query/sql/alter-mat-view-set-ttl",
                  ],
                },
                {
                  id: "query/sql/acl/alter-user",
                  type: "doc",
                        },
                "query/sql/alter-view",
              ],
            },
            "query/sql/acl/assume-service-account",
            "query/sql/backup",
            "query/sql/cancel-query",
            "query/sql/checkpoint",
            "query/sql/compile-view",
            "query/sql/copy",
            {
              type: "category",
              label: "CREATE",
              items: [
                {
                  id: "query/sql/acl/create-group",
                  type: "doc",
                        },
                "query/sql/create-mat-view",
                {
                  id: "query/sql/acl/create-service-account",
                  type: "doc",
                        },
                "query/sql/create-table",
                {
                  id: "query/sql/acl/create-user",
                  type: "doc",
                        },
                "query/sql/create-view",
              ],
            },
            {
              type: "category",
              label: "DROP",
              items: [
                {
                  id: "query/sql/acl/drop-group",
                  type: "doc",
                        },
                "query/sql/drop-mat-view",
                {
                  id: "query/sql/acl/drop-service-account",
                  type: "doc",
                        },
                "query/sql/drop",
                {
                  id: "query/sql/acl/drop-user",
                  type: "doc",
                        },
                "query/sql/drop-view",
              ],
            },
            {
              id: "query/sql/acl/exit-service-account",
              type: "doc",
                },
            "query/sql/explain",
            {
              type: "category",
              label: "GRANT",
                  items: [
                {
                  id: "query/sql/acl/grant",
                  type: "doc",
                },
                {
                  id: "query/sql/acl/grant-assume-service-account",
                  type: "doc",
                },
              ],
            },
            "query/sql/insert",
            "query/sql/refresh-mat-view",
            "query/sql/reindex",
            {
              id: "query/sql/acl/remove-user",
              type: "doc",
                },
            "query/sql/rename",
            {
              type: "category",
              label: "REVOKE",
                  items: [
                {
                  id: "query/sql/acl/revoke",
                  type: "doc",
                },
                {
                  id: "query/sql/acl/revoke-assume-service-account",
                  type: "doc",
                },
              ],
            },
            {
              type: "category",
              label: "SELECT",
              items: [
                "query/sql/select",
                "query/sql/asof-join",
                "query/sql/case",
                "query/sql/cast",
                "query/sql/declare",
                "query/sql/distinct",
                "query/sql/fill",
                "query/sql/group-by",
                "query/sql/join",
                "query/sql/latest-on",
                "query/sql/limit",
                "query/sql/order-by",
                "query/sql/pivot",
                "query/sql/sample-by",
                "query/sql/where",
                "query/sql/window-join",
                "query/sql/with",
              ],
            },
            "query/sql/show",
            "query/sql/snapshot",
            "query/sql/truncate",
            "query/sql/union-except-intersect",
            "query/sql/update",
            "query/sql/vacuum-table",
          ],
        },
        "query/sql-execution-order",
        {
          type: "category",
          label: "Functions",
          items: [
            "query/functions/aggregation",
            "query/functions/array",
            "query/functions/binary",
            "query/functions/boolean",
            "query/functions/conditional",
            "query/functions/date-time",
            "query/functions/finance",
            "query/functions/hash",
            "query/functions/json",
            "query/functions/meta",
            "query/functions/numeric",
            "query/functions/parquet",
            "query/functions/pattern-matching",
            "query/functions/random-value-generator",
            "query/functions/row-generator",
            "query/functions/spatial",
            "query/functions/text",
            "query/functions/timestamp",
            "query/functions/touch",
            "query/functions/trigonometric",
            "query/functions/uuid",
            {
              type: "category",
              label: "Window Functions",
              items: [
                "query/functions/window-functions/overview",
                "query/functions/window-functions/reference",
                "query/functions/window-functions/syntax",
              ],
            },
          ],
        },
        {
          type: "category",
          label: "Operators",
          items: [
            "query/operators/bitwise",
            "query/operators/comparison",
            "query/operators/date-time",
            {
              id: "query/operators/tick",
              type: "doc",
              label: "Time Intervals (TICK)",
            },
            "query/operators/exchange-calendars",
            "query/operators/ipv4",
            "query/operators/logical",
            "query/operators/misc",
            "query/operators/numeric",
            "query/operators/precedence",
            "query/operators/spatial",
            "query/operators/text",
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
            "concepts/designated-timestamp",
            "concepts/timestamps-timezones",
            "concepts/partitions",
            "concepts/symbol",
            {
              id: "concepts/views",
              type: "doc",
              label: "Views",
            },
            {
              id: "concepts/materialized-views",
              type: "doc",
              label: "Materialized Views",
            },
            "concepts/deduplication",
            "concepts/ttl",
            "concepts/write-ahead-log",
          ],
        },
        {
          type: "category",
          label: "Deep Dive",
          collapsed: true,
          items: [
            "concepts/deep-dive/indexes",
            "concepts/deep-dive/interval-scan",
            "concepts/deep-dive/jit-compiler",
            "concepts/deep-dive/query-tracing",
            "concepts/deep-dive/sql-extensions",
            "concepts/deep-dive/sql-optimizer-hints",
            "concepts/deep-dive/root-directory-structure",
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
        "architecture/overview",
        "architecture/storage-engine",
        "architecture/memory-management",
        "architecture/query-engine",
        "architecture/time-series-optimizations",
        "architecture/observability",
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
          id: "configuration/overview",
          type: "doc",
          label: "Overview",
        },
        "configuration/command-line-options",
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
          id: "security/rbac",
          type: "doc",
          label: "Role-Based Access Control (RBAC)",
        },
        {
          id: "security/oidc",
          type: "doc",
          label: "OpenID Connect (OIDC)",
        },
        {
          type: "doc",
          id: "security/tls",
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
          id: "high-availability/overview",
          type: "doc",
          label: "Overview",
        },
        {
          id: "high-availability/setup",
          type: "doc",
          label: "Setup Guide",
        },
        {
          id: "high-availability/tuning",
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
        "operations/modifying-data",
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
        "deployment/compression-zfs",
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
          id: "integrations/overview",
        },
        {
          type: "category",
          label: "Visualization",
          collapsed: true,
          items: [
            "integrations/visualization/grafana",
            "integrations/visualization/qstudio",
            "integrations/visualization/superset",
            "integrations/visualization/powerbi",
            "integrations/visualization/embeddable",
          ],
        },
        {
          type: "category",
          label: "Data Processing",
          collapsed: true,
          items: [
            "integrations/data-processing/pandas",
            "integrations/data-processing/polars",
            "integrations/data-processing/spark",
          ],
        },
        {
          type: "category",
          label: "Orchestration",
          collapsed: true,
          items: [
            "integrations/orchestration/airflow",
            "integrations/orchestration/dagster",
          ],
        },
        {
          type: "category",
          label: "Other Tools",
          collapsed: true,
          items: [
            "integrations/other/prometheus",
            "integrations/other/sqlalchemy",
            "integrations/other/mindsdb",
            "integrations/other/databento",
            "integrations/other/cube",
            "integrations/other/ignition",
            "integrations/other/airbyte",
          ],
        },
      ],
    },

    // ===================
    // TUTORIALS & COOKBOOK
    // ===================
    {
      label: "Tutorials & Cookbook",
      type: "category",
      items: [
        {
          type: "category",
          label: "Cookbook",
          collapsed: false,
          items: [
            "cookbook/index",
            "cookbook/demo-data-schema",
            {
              type: "category",
              label: "SQL Recipes",
              collapsed: true,
              items: [
                {
                  type: "category",
                  label: "Capital Markets",
                  collapsed: true,
                  link: {
                    type: "doc",
                    id: "cookbook/sql/finance/index",
                  },
                  items: [
                    {
                      type: "doc",
                      id: "cookbook/sql/finance/index",
                      label: "Overview",
                    },
                    "cookbook/sql/finance/aggressor-volume-imbalance",
                    "cookbook/sql/finance/atr",
                    "cookbook/sql/finance/bid-ask-spread",
                    "cookbook/sql/finance/bollinger-bands",
                    "cookbook/sql/finance/bollinger-bandwidth",
                    "cookbook/sql/finance/compound-interest",
                    "cookbook/sql/finance/cumulative-product",
                    "cookbook/sql/finance/donchian-channels",
                    "cookbook/sql/finance/keltner-channels",
                    "cookbook/sql/finance/liquidity-comparison",
                    "cookbook/sql/finance/macd",
                    "cookbook/sql/finance/maximum-drawdown",
                    "cookbook/sql/finance/obv",
                    "cookbook/sql/finance/ohlc",
                    "cookbook/sql/finance/rate-of-change",
                    "cookbook/sql/finance/realized-volatility",
                    "cookbook/sql/finance/rolling-stddev",
                    "cookbook/sql/finance/rsi",
                    "cookbook/sql/finance/stochastic",
                    "cookbook/sql/finance/tick-trin",
                    "cookbook/sql/finance/volume-profile",
                    "cookbook/sql/finance/volume-spike",
                    "cookbook/sql/finance/vwap",
                  ],
                },
                {
                  type: "category",
                  label: "Time-Series Patterns",
                  collapsed: true,
                  items: [
                    "cookbook/sql/time-series/elapsed-time",
                    "cookbook/sql/time-series/force-designated-timestamp",
                    "cookbook/sql/time-series/latest-n-per-partition",
                    "cookbook/sql/time-series/session-windows",
                    "cookbook/sql/time-series/latest-activity-window",
                    "cookbook/sql/time-series/filter-by-week",
                    "cookbook/sql/time-series/distribute-discrete-values",
                    "cookbook/sql/time-series/epoch-timestamps",
                    "cookbook/sql/time-series/sample-by-interval-bounds",
                    "cookbook/sql/time-series/remove-outliers",
                    "cookbook/sql/time-series/fill-from-one-column",
                    "cookbook/sql/time-series/fill-prev-with-history",
                    "cookbook/sql/time-series/fill-keyed-arbitrary-interval",
                    "cookbook/sql/time-series/sparse-sensor-data",
                  ],
                },
                {
                  type: "category",
                  label: "Advanced SQL",
                  collapsed: true,
                  items: [
                    "cookbook/sql/advanced/rows-before-after-value-match",
                    "cookbook/sql/advanced/local-min-max",
                    "cookbook/sql/advanced/top-n-plus-others",
                    "cookbook/sql/advanced/pivot-with-others",
                    "cookbook/sql/advanced/unpivot-table",
                    "cookbook/sql/advanced/sankey-funnel",
                    "cookbook/sql/advanced/conditional-aggregates",
                    "cookbook/sql/advanced/general-and-sampled-aggregates",
                    "cookbook/sql/advanced/consistent-histogram-buckets",
                    "cookbook/sql/advanced/array-from-string",
                  ],
                },
              ],
            },
            {
              type: "category",
              label: "Integrations",
              collapsed: true,
              items: [
                "cookbook/integrations/opcua-dense-format",
                {
                  type: "category",
                  label: "Grafana",
                  collapsed: true,
                  items: [
                    "cookbook/integrations/grafana/dynamic-table-queries",
                    "cookbook/integrations/grafana/read-only-user",
                    "cookbook/integrations/grafana/variable-dropdown",
                    "cookbook/integrations/grafana/overlay-timeshift",
                  ],
                },
              ],
            },
            {
              type: "category",
              label: "Programmatic",
              collapsed: true,
              items: [
                "cookbook/programmatic/tls-ca-configuration",
                {
                  type: "category",
                  label: "PHP",
                  items: [
                    "cookbook/programmatic/php/inserting-ilp",
                  ],
                },
                {
                  type: "category",
                  label: "Ruby",
                  items: [
                    "cookbook/programmatic/ruby/inserting-ilp",
                  ],
                },
                {
                  type: "category",
                  label: "C++",
                  items: [
                    "cookbook/programmatic/cpp/missing-columns",
                  ],
                },
              ],
            },
            {
              type: "category",
              label: "Operations",
              collapsed: true,
              items: [
                "cookbook/operations/docker-compose-config",
                "cookbook/operations/store-questdb-metrics",
                "cookbook/operations/csv-import-milliseconds",
                "cookbook/operations/tls-pgbouncer",
                "cookbook/operations/copy-data-between-instances",
                "cookbook/operations/query-times-histogram",
                "cookbook/operations/optimize-many-tables",
                "cookbook/operations/check-transaction-applied",
                "cookbook/operations/show-non-default-params",
              ],
            },
          ],
        },
        {
          id: "tutorials/order-book",
          label: "Order Book Analytics",
          type: "doc",
        },
        {
          label: "Ingest L2 order book data",
          type: "link",
          href: "https://questdb.com/blog/level-2-order-book-data-into-questdb-arrays/",
        },
        {
          label: "OHLC with materialized views",
          type: "link",
          href: "https://questdb.com/blog/how-to-create-a-materialized-view/",
        },
        "tutorials/influxdb-migration",
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
        "troubleshooting/profiling",
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
