# QuestDB Documentation Restructure Mapping

This document maps current file paths to their new locations based on sidebar hierarchy.
The goal is to align URL slugs with the navigation structure for better UX, SEO, and LLM comprehension.

## Principles

1. **URL = Navigation path**: A page's URL should reflect where it sits in the sidebar
2. **Predictable URLs**: Users and LLMs should be able to guess URLs based on topic
3. **SEO-friendly**: Clear hierarchy helps search engines understand content relationships

---

## Root Level (No change needed)

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `introduction.md` | `introduction.md` | OK - root level |
| `guides/schema-design-essentials.md` | `schema-design-essentials.md` | Move to root (appears at root in sidebar) |

---

## Getting Started

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `quick-start.mdx` | `getting-started/quick-start.mdx` | |
| `third-party-tools/llm-coding-assistants.md` | `getting-started/llm-coding-assistants.md` | |
| `operations/capacity-planning.md` | `getting-started/capacity-planning.md` | |
| `guides/create-database.md` | `getting-started/create-database.md` | |
| `operations/migrate-to-enterprise.md` | `getting-started/migrate-to-enterprise.md` | |
| `guides/enterprise-quick-start.md` | `getting-started/enterprise-quick-start.md` | |

### Getting Started > Web Console

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `web-console.md` | `getting-started/web-console/overview.md` | Rename to overview |
| `web-console/code-editor.md` | `getting-started/web-console/code-editor.md` | |
| `web-console/metrics-view.md` | `getting-started/web-console/metrics-view.md` | |
| `web-console/schema-explorer.md` | `getting-started/web-console/schema-explorer.md` | |
| `web-console/result-grid.md` | `getting-started/web-console/result-grid.md` | |
| `web-console/query-log.md` | `getting-started/web-console/query-log.md` | |
| `web-console/import-csv.md` | `getting-started/web-console/import-csv.md` | |
| `web-console/create-table.md` | `getting-started/web-console/create-table.md` | |

---

## Ingestion Reference

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `ingestion-overview.md` | `ingestion/overview.md` | |

### Ingestion > Language Clients

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `configuration-string.md` | `ingestion/clients/configuration-string.md` | |
| `clients/ingest-python.md` | `ingestion/clients/python.md` | Simplify name |
| `clients/ingest-go.md` | `ingestion/clients/go.md` | Simplify name |
| `clients/java-ilp.md` | `ingestion/clients/java.md` | Simplify name |
| `clients/ingest-rust.md` | `ingestion/clients/rust.md` | Simplify name |
| `clients/ingest-node.md` | `ingestion/clients/nodejs.md` | Simplify name |
| `clients/ingest-c-and-cpp.md` | `ingestion/clients/c-and-cpp.md` | |
| `clients/ingest-dotnet.md` | `ingestion/clients/dotnet.md` | Simplify name |
| `clients/date-to-timestamp-conversion.md` | `ingestion/clients/date-to-timestamp-conversion.md` | |

### Ingestion > Message Brokers

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `third-party-tools/kafka.md` | `ingestion/message-brokers/kafka.md` | |
| `third-party-tools/telegraf.md` | `ingestion/message-brokers/telegraf.md` | |
| `third-party-tools/redpanda.md` | `ingestion/message-brokers/redpanda.md` | |
| `third-party-tools/flink.md` | `ingestion/message-brokers/flink.md` | |

### Ingestion > Protocols > ILP

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `reference/api/ilp/overview.md` | `ingestion/ilp/overview.md` | |
| `reference/api/ilp/columnset-types.md` | `ingestion/ilp/columnset-types.md` | |
| `reference/api/ilp/advanced-settings.md` | `ingestion/ilp/advanced-settings.md` | |

### Ingestion > Protocols > Other

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `reference/api/java-embedded.md` | `ingestion/java-embedded.md` | |

### Ingestion > CSV Import

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `guides/import-csv.md` | `ingestion/import-csv.md` | |

---

## Query & SQL Reference

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `reference/sql/overview.md` | `query/overview.md` | |

### Query > PostgreSQL Wire Protocol

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `pgwire/pgwire-intro.md` | `query/pgwire/overview.md` | Rename to overview |
| `pgwire/large-result-sets.md` | `query/pgwire/large-result-sets.md` | |
| `pgwire/python.md` | `query/pgwire/python.md` | |
| `pgwire/go.md` | `query/pgwire/go.md` | |
| `pgwire/java.md` | `query/pgwire/java.md` | |
| `pgwire/rust.md` | `query/pgwire/rust.md` | |
| `pgwire/javascript.md` | `query/pgwire/nodejs.md` | Rename for consistency |
| `pgwire/c-sharp.md` | `query/pgwire/dotnet.md` | Rename for consistency |
| `pgwire/php.md` | `query/pgwire/php.md` | |
| `pgwire/rpostgres.md` | `query/pgwire/r.md` | Simplify name |
| `pgwire/c-and-cpp.md` | `query/pgwire/c-and-cpp.md` | |

### Query > REST API

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `reference/api/rest.md` | `query/rest-api.md` | |

### Query > Export

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `guides/export-parquet.md` | `query/export-parquet.md` | |

### Query > Data Types

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `reference/sql/datatypes.md` | `query/datatypes/overview.md` | |
| `concept/array.md` | `query/datatypes/array.md` | |
| `concept/decimal.md` | `query/datatypes/decimal.md` | |
| `concept/geohashes.md` | `query/datatypes/geohashes.md` | |

### Query > SQL Syntax

All files in `reference/sql/` (except datatypes.md and overview.md) should move to `query/sql/`:

| Current Path | New Path |
|-------------|----------|
| `reference/sql/acl/*.md` | `query/sql/acl/*.md` |
| `reference/sql/alter-*.md` | `query/sql/alter-*.md` |
| `reference/sql/asof-join.md` | `query/sql/asof-join.md` |
| `reference/sql/cancel-query.md` | `query/sql/cancel-query.md` |
| `reference/sql/case.md` | `query/sql/case.md` |
| `reference/sql/cast.md` | `query/sql/cast.md` |
| `reference/sql/checkpoint.md` | `query/sql/checkpoint.md` |
| `reference/sql/compile-view.md` | `query/sql/compile-view.md` |
| `reference/sql/copy.md` | `query/sql/copy.md` |
| `reference/sql/create-*.md` | `query/sql/create-*.md` |
| `reference/sql/declare.md` | `query/sql/declare.md` |
| `reference/sql/distinct.md` | `query/sql/distinct.md` |
| `reference/sql/drop*.md` | `query/sql/drop*.md` |
| `reference/sql/explain.md` | `query/sql/explain.md` |
| `reference/sql/fill.md` | `query/sql/fill.md` |
| `reference/sql/group-by.md` | `query/sql/group-by.md` |
| `reference/sql/insert.md` | `query/sql/insert.md` |
| `reference/sql/join.md` | `query/sql/join.md` |
| `reference/sql/latest-on.md` | `query/sql/latest-on.md` |
| `reference/sql/limit.md` | `query/sql/limit.md` |
| `reference/sql/order-by.md` | `query/sql/order-by.md` |
| `reference/sql/over.md` | `query/sql/over.md` |
| `reference/sql/refresh-mat-view.md` | `query/sql/refresh-mat-view.md` |
| `reference/sql/reindex.md` | `query/sql/reindex.md` |
| `reference/sql/rename.md` | `query/sql/rename.md` |
| `reference/sql/sample-by.md` | `query/sql/sample-by.md` |
| `reference/sql/select.md` | `query/sql/select.md` |
| `reference/sql/show.md` | `query/sql/show.md` |
| `reference/sql/snapshot.md` | `query/sql/snapshot.md` |
| `reference/sql/truncate.md` | `query/sql/truncate.md` |
| `reference/sql/union-except-intersect.md` | `query/sql/union-except-intersect.md` |
| `reference/sql/update.md` | `query/sql/update.md` |
| `reference/sql/vacuum-table.md` | `query/sql/vacuum-table.md` |
| `reference/sql/where.md` | `query/sql/where.md` |
| `reference/sql/window-join.md` | `query/sql/window-join.md` |
| `reference/sql/with.md` | `query/sql/with.md` |

### Query > SQL Execution Order

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `concept/sql-execution-order.md` | `query/sql-execution-order.md` | |

### Query > Functions

All files in `reference/function/` should move to `query/functions/`:

| Current Path | New Path |
|-------------|----------|
| `reference/function/aggregation.md` | `query/functions/aggregation.md` |
| `reference/function/array.md` | `query/functions/array.md` |
| `reference/function/binary.md` | `query/functions/binary.md` |
| `reference/function/boolean.md` | `query/functions/boolean.md` |
| `reference/function/conditional.md` | `query/functions/conditional.md` |
| `reference/function/date-time.md` | `query/functions/date-time.md` |
| `reference/function/finance.md` | `query/functions/finance.md` |
| `reference/function/hash.md` | `query/functions/hash.md` |
| `reference/function/json.md` | `query/functions/json.md` |
| `reference/function/meta.md` | `query/functions/meta.md` |
| `reference/function/numeric.md` | `query/functions/numeric.md` |
| `reference/function/parquet.md` | `query/functions/parquet.md` |
| `reference/function/pattern-matching.md` | `query/functions/pattern-matching.md` |
| `reference/function/random-value-generator.md` | `query/functions/random-value-generator.md` |
| `reference/function/row-generator.md` | `query/functions/row-generator.md` |
| `reference/function/spatial.md` | `query/functions/spatial.md` |
| `reference/function/text.md` | `query/functions/text.md` |
| `reference/function/timestamp-generator.md` | `query/functions/timestamp-generator.md` |
| `reference/function/timestamp.md` | `query/functions/timestamp.md` |
| `reference/function/touch.md` | `query/functions/touch.md` |
| `reference/function/trigonometric.md` | `query/functions/trigonometric.md` |
| `reference/function/uuid.md` | `query/functions/uuid.md` |
| `reference/function/window.md` | `query/functions/window.md` |

### Query > Operators

All files in `reference/operators/` should move to `query/operators/`:

| Current Path | New Path |
|-------------|----------|
| `reference/operators/bitwise.md` | `query/operators/bitwise.md` |
| `reference/operators/comparison.md` | `query/operators/comparison.md` |
| `reference/operators/date-time.md` | `query/operators/date-time.md` |
| `reference/operators/ipv4.md` | `query/operators/ipv4.md` |
| `reference/operators/logical.md` | `query/operators/logical.md` |
| `reference/operators/misc.md` | `query/operators/misc.md` |
| `reference/operators/numeric.md` | `query/operators/numeric.md` |
| `reference/operators/precedence.md` | `query/operators/precedence.md` |
| `reference/operators/spatial.md` | `query/operators/spatial.md` |
| `reference/operators/text.md` | `query/operators/text.md` |

---

## Concepts

### Concepts > Core Concepts

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `concept/designated-timestamp.md` | `concepts/designated-timestamp.md` | |
| `guides/working-with-timestamps-timezones.md` | `concepts/timestamps-timezones.md` | Simplify name |
| `concept/partitions.md` | `concepts/partitions.md` | |
| `concept/symbol.md` | `concepts/symbol.md` | |
| `concept/views.md` | `concepts/views.md` | |
| `concept/mat-views.md` | `concepts/materialized-views.md` | Clearer name |
| `concept/deduplication.md` | `concepts/deduplication.md` | |
| `concept/ttl.md` | `concepts/ttl.md` | |
| `concept/write-ahead-log.md` | `concepts/write-ahead-log.md` | |

### Concepts > Deep Dive

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `concept/indexes.md` | `concepts/deep-dive/indexes.md` | |
| `concept/interval-scan.md` | `concepts/deep-dive/interval-scan.md` | |
| `concept/jit-compiler.md` | `concepts/deep-dive/jit-compiler.md` | |
| `concept/query-tracing.md` | `concepts/deep-dive/query-tracing.md` | |
| `concept/sql-extensions.md` | `concepts/deep-dive/sql-extensions.md` | |
| `concept/sql-optimizer-hints.md` | `concepts/deep-dive/sql-optimizer-hints.md` | |
| `concept/root-directory-structure.md` | `concepts/deep-dive/root-directory-structure.md` | |

---

## Architecture

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `guides/architecture/overview.mdx` | `architecture/overview.mdx` | |
| `guides/architecture/storage-engine.md` | `architecture/storage-engine.md` | |
| `guides/architecture/memory-management.md` | `architecture/memory-management.md` | |
| `guides/architecture/query-engine.md` | `architecture/query-engine.md` | |
| `guides/architecture/time-series-optimizations.md` | `architecture/time-series-optimizations.md` | |
| `guides/architecture/observability.md` | `architecture/observability.md` | |

---

## Configuration

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `configuration.md` | `configuration/overview.md` | |
| `operations/command-line-options.md` | `configuration/command-line-options.md` | |

---

## Security

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `operations/rbac.md` | `security/rbac.md` | |
| `operations/openid-connect-oidc-integration.mdx` | `security/oidc.mdx` | Simplify name |
| `operations/tls.md` | `security/tls.md` | |

---

## High Availability

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `concept/replication.md` | `high-availability/overview.md` | |
| `operations/replication.md` | `high-availability/setup.md` | Clearer name |
| `guides/replication-tuning.md` | `high-availability/tuning.md` | Simplify name |

---

## Operations

These files stay in `operations/` (already aligned):

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `operations/backup.md` | `operations/backup.md` | OK |
| `operations/logging-metrics.md` | `operations/logging-metrics.md` | OK |
| `operations/monitoring-alerting.md` | `operations/monitoring-alerting.md` | OK |
| `operations/data-retention.md` | `operations/data-retention.md` | OK |
| `operations/updating-data.md` | `operations/updating-data.md` | OK |
| `operations/modifying-data.md` | `operations/modifying-data.md` | OK |
| `operations/task-automation.md` | `operations/task-automation.md` | OK |

---

## Deployment

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `deployment/docker.md` | `deployment/docker.md` | OK |
| `deployment/kubernetes.md` | `deployment/kubernetes.md` | OK |
| `deployment/systemd.md` | `deployment/systemd.md` | OK |
| `deployment/aws.md` | `deployment/aws.md` | OK |
| `deployment/azure.md` | `deployment/azure.md` | OK |
| `deployment/gcp.md` | `deployment/gcp.md` | OK |
| `deployment/digital-ocean.md` | `deployment/digital-ocean.md` | OK |
| `deployment/hetzner.md` | `deployment/hetzner.md` | OK |
| `guides/compression-zfs.md` | `deployment/compression-zfs.md` | |

---

## Integrations

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `third-party-tools/overview.md` | `integrations/overview.md` | |

### Integrations > Visualization

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `third-party-tools/grafana.md` | `integrations/visualization/grafana.md` | |
| `third-party-tools/qstudio.md` | `integrations/visualization/qstudio.md` | |
| `third-party-tools/superset.md` | `integrations/visualization/superset.md` | |
| `third-party-tools/powerbi.md` | `integrations/visualization/powerbi.md` | |
| `third-party-tools/embeddable.md` | `integrations/visualization/embeddable.md` | |

### Integrations > Data Processing

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `third-party-tools/pandas.md` | `integrations/data-processing/pandas.md` | |
| `third-party-tools/polars.md` | `integrations/data-processing/polars.md` | |
| `third-party-tools/spark.md` | `integrations/data-processing/spark.md` | |

### Integrations > Orchestration

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `third-party-tools/airflow.md` | `integrations/orchestration/airflow.md` | |
| `third-party-tools/dagster.md` | `integrations/orchestration/dagster.md` | |

### Integrations > Other Tools

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `third-party-tools/prometheus.md` | `integrations/other/prometheus.md` | |
| `third-party-tools/sqlalchemy.md` | `integrations/other/sqlalchemy.md` | |
| `third-party-tools/mindsdb.md` | `integrations/other/mindsdb.md` | |
| `third-party-tools/databento.md` | `integrations/other/databento.md` | |
| `third-party-tools/cube.md` | `integrations/other/cube.md` | |
| `third-party-tools/ignition.md` | `integrations/other/ignition.md` | |
| `third-party-tools/airbyte.md` | `integrations/other/airbyte.md` | |

---

## Tutorials

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `guides/order-book.md` | `tutorials/order-book.md` | |
| `guides/influxdb-migration.md` | `tutorials/influxdb-migration.md` | |

---

## Troubleshooting

| Current Path | New Path | Notes |
|-------------|----------|-------|
| `troubleshooting/faq.md` | `troubleshooting/faq.md` | OK |
| `operations/profiling.md` | `troubleshooting/profiling.md` | |
| `troubleshooting/os-error-codes.md` | `troubleshooting/os-error-codes.md` | OK |
| `troubleshooting/error-codes.md` | `troubleshooting/error-codes.md` | OK |

---

## Directories to Delete After Migration

These directories will be empty after migration and should be removed:

- `clients/` (merged into `ingestion/clients/`)
- `concept/` (split between `concepts/` and `query/datatypes/`)
- `guides/` (distributed to appropriate sections)
- `pgwire/` (moved to `query/pgwire/`)
- `reference/` (moved to `query/`)
- `third-party-tools/` (split between `ingestion/message-brokers/` and `integrations/`)
- `web-console/` (moved to `getting-started/web-console/`)

---

## Summary Statistics

- **Total files to move**: ~150
- **New directories to create**: ~25
- **Old directories to remove**: 7
- **Files already in correct location**: ~15 (deployment/*, some operations/*, troubleshooting/*)

---

## Migration Order

1. Create new directory structure
2. Move files (preserving git history with `git mv`)
3. Update `sidebars.js` with new paths
4. Update any internal links between documents
5. Add redirects for old URLs (in docusaurus.config.js)
6. Remove empty old directories
7. Test build and verify all links work
