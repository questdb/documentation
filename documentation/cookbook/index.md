---
title: Cookbook overview
sidebar_label: Overview
description: Quick recipes and practical examples for common QuestDB tasks and queries
---

The Cookbook is a collection of **short, actionable recipes** that demonstrate how to accomplish specific tasks with QuestDB. Each recipe follows a problem-solution-result format, making it easy to find and apply solutions quickly.

## What is the cookbook?

Unlike comprehensive reference documentation, the Cookbook focuses on practical examples for:

- **Common SQL patterns** - Window functions, pivoting, time-series aggregations
- **Programmatic integration** - Language-specific client examples
- **Operations** - Deployment and configuration tasks

Each recipe provides a focused solution to a specific problem, with working code examples and expected results.

## Structure

The Cookbook is organized into the following sections:

- **SQL Recipes** - Common SQL patterns, window functions, and time-series queries
  - **[Capital Markets](/docs/cookbook/sql/finance/)** - Technical indicators, execution analysis, and risk metrics for financial data
  - **[Time-Series Patterns](/docs/cookbook/sql/time-series/elapsed-time/)** - Common patterns for working with time-series data
  - **[Advanced SQL](/docs/cookbook/sql/advanced/rows-before-after-value-match/)** - Complex query patterns like pivoting, funnels, and histograms
- **Programmatic** - Language-specific client examples and integration patterns
- **Operations** - Deployment, configuration, and operational tasks

### Post-trade and execution analysis

QuestDB's time-series joins (`ASOF JOIN`, `HORIZON JOIN`) and high-resolution timestamps make it well-suited for **Transaction Cost Analysis (TCA)** and post-trade workflows. The [Execution & Post-Trade Analysis](/docs/cookbook/sql/finance/) section includes recipes for:

- [Slippage measurement](/docs/cookbook/sql/finance/slippage/) - Per-fill and aggregated slippage against mid and top-of-book
- [Markout analysis](/docs/cookbook/sql/finance/markout/) - Post-trade price reversion curves and adverse selection detection
- [Last look detection](/docs/cookbook/sql/finance/last-look/) - Millisecond-granularity counterparty analysis
- [Implementation shortfall](/docs/cookbook/sql/finance/implementation-shortfall/) - Cost decomposition into spread, permanent, and temporary impact

## Running the examples

**Most recipes run directly on our [live demo instance at demo.questdb.com](https://demo.questdb.com)** without any local setup. Queries that can be executed on the demo site are marked with a direct link to run them.

For recipes that require write operations or specific configuration, the recipe will indicate what setup is needed.

The demo instance contains live FX market data with tables for core prices and order book snapshots. See the [Demo Data Schema](/docs/cookbook/demo-data-schema/) page for details about available tables and their structure.

## Using the cookbook

Each recipe follows a consistent format:

1. **Problem statement** - What you're trying to accomplish
2. **Solution** - Code example with explanation
3. **Results** - Expected output or verification
4. **Additional context** - Tips, variations, or related documentation links

Start by browsing the SQL Recipes section for common patterns, or jump directly to the recipe that matches your needs.
