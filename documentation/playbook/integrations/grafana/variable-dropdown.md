---
title: Grafana Variable Dropdown with Name and Value
sidebar_label: Variable dropdown
description: Create Grafana variable dropdowns that display one value but use another in queries using regex filters
---

Create Grafana variable dropdowns where the displayed label differs from the value used in queries. This is useful when you want to show user-friendly names in the dropdown while using different values (like IDs, prices, or technical identifiers) in your actual SQL queries.

## Problem: Separate Display and Query Values

You want a Grafana variable dropdown that:
- **Displays:** Readable labels like `"BTC-USDT"`, `"ETH-USDT"`, `"SOL-USDT"`
- **Uses in queries:** Different values like prices (`37779.62`, `2615.54`, `98.23`) or IDs

For example, with this query result:

| symbol     | price   |
|------------|---------|
| BTC-USDT   | 37779.62|
| ETH-USDT   | 2615.54 |
| SOL-USDT   | 98.23   |

You want the dropdown to show `"BTC-USDT"` but use `37779.62` in your queries.

## Solution: Use Regex Variable Filters

When using the QuestDB data source plugin, you can use Grafana's regex variable filters to parse a concatenated string into separate `text` and `value` fields.

### Step 1: Concatenate Columns in Query

First, combine both columns into a single string with a separator that doesn't appear in your data:

```sql
WITH t AS (
  SELECT symbol, first(price) as price
  FROM trades
  WHERE symbol LIKE '%BTC%'
)
SELECT concat(symbol, '#', price) FROM t;
```

**Query results:**
```
DOGE-BTC#0.00000204
ETH-BTC#0.05551
BTC-USDT#37779.62
SOL-BTC#0.0015282
MATIC-BTC#0.00002074
BTC-USDC#60511.1
```

Each row is now a single string with symbol and price separated by `#`.

### Step 2: Apply Regex Filter in Grafana Variable

In your Grafana variable configuration:

**Query:**
```sql
WITH t AS (
  SELECT symbol, first(price) as price
  FROM trades
  WHERE symbol LIKE '%BTC%'
)
SELECT concat(symbol, '#', price) FROM t;
```

**Regex Filter:**
```regex
/(?<text>[^#]+)#(?<value>.*)/
```

This regex pattern:
- `(?<text>[^#]+)`: Captures everything before `#` into the `text` group (the display label)
- `#`: Matches the separator
- `(?<value>.*)`: Captures everything after `#` into the `value` group (the query value)

### Step 3: Use Variable in Queries

Now you can reference the variable in your dashboard queries:

```sql
SELECT timestamp, price
FROM trades
WHERE price = $your_variable_name
  AND timestamp >= $__fromTime
  AND timestamp <= $__toTime;
```

When a user selects "BTC-USDT" from the dropdown, Grafana will substitute the corresponding price value (`37779.62`) into the query.

## How It Works

Grafana's regex filter with named capture groups enables the separation:

1. **Named capture groups**: `(?<text>...)` and `(?<value>...)` tell Grafana which parts to use
2. **`text` group**: Becomes the visible label in the dropdown
3. **`value` group**: Becomes the interpolated value in queries
4. **Pattern matching**: The regex must match the entire string returned by your query

### Regex Pattern Breakdown

```regex
/(?<text>[^#]+)#(?<value>.*)/
```

- `/`: Regex delimiters
- `(?<text>...)`: Named capture group called "text"
- `[^#]+`: One or more characters that are NOT `#` (greedy match)
- `#`: Literal separator character
- `(?<value>.*)`: Named capture group called "value"
- `.*`: Zero or more characters of any type (captures rest of string)

## Choosing a Separator

Pick a separator that **never** appears in your data:

**Good separators:**
- `#` - Uncommon in most data
- `|` - Clear visual separator
- `::` - Two characters, unlikely to appear
- `~` - Rarely used in trading symbols or prices
- `^^^` - Multi-character separator for extra safety

**Bad separators:**
- `-` - Common in trading pairs (BTC-USDT)
- `.` - Common in decimal numbers
- `,` - Common in CSV-like data
- Space - Can cause parsing issues

## Alternative Patterns

### Multiple Data Fields

If you need more than two fields, use additional separators:

```sql
SELECT concat(symbol, '#', price, '#', volume) FROM trades;
```

```regex
/(?<text>[^#]+)#(?<value>[^#]+)#(?<extra>.*)/
```

Now you have three captured groups, though Grafana's variable system typically only uses `text` and `value`.

### Numeric IDs with Descriptions

Common pattern for entity selection:

```sql
SELECT concat(name, '#', id) FROM users;
```

```regex
/(?<text>[^#]+)#(?<value>\d+)/
```

Output in dropdown: User sees "John Doe", query uses `42`.

### Escaping Special Characters

If your data contains regex special characters, escape them in the pattern:

```sql
-- If data contains parentheses
SELECT concat(name, ' (', id, ')', '#', id) FROM users;
-- Result: "John Doe (42)#42"
```

```regex
/(?<text>.*?)#(?<value>\d+)/
```

## PostgreSQL Data Source Alternative

If using the PostgreSQL data source (instead of the QuestDB plugin), you can use special column aliases:

```sql
SELECT
  symbol AS __text,
  price AS __value
FROM trades
WHERE symbol LIKE '%BTC%';
```

The PostgreSQL data source recognizes `__text` and `__value` as special column names for dropdown variables.

**Note:** This works with the PostgreSQL data source plugin pointing to QuestDB, but NOT with the native QuestDB data source plugin.

## Adapting the Pattern

**Different filter conditions:**
```sql
-- Filter by time range
WHERE timestamp IN yesterday()

-- Filter by multiple criteria
WHERE symbol LIKE '%USDT' AND price > 1000

-- Dynamic filter using another variable
WHERE symbol LIKE concat('%', $base_currency, '%')
```

**Sorting the dropdown:**
```sql
-- Sort alphabetically by symbol
SELECT concat(symbol, '#', price) FROM trades
ORDER BY symbol;

-- Sort by price (highest first)
SELECT concat(symbol, '#', price) FROM trades
ORDER BY price DESC;

-- Sort by volume
WITH t AS (
  SELECT symbol, first(price) as price, sum(amount) as volume
  FROM trades
  GROUP BY symbol
)
SELECT concat(symbol, '#', price) FROM t
ORDER BY volume DESC;
```

**Include additional context in label:**
```sql
-- Show symbol and volume in the label
SELECT concat(symbol, ' (Vol: ', round(sum(amount), 2), ')', '#', first(price))
FROM trades
GROUP BY symbol;
```

Result: "BTC-USDT (Vol: 1234.56)#37779.62"

## Troubleshooting

**Dropdown shows concatenated string:**
- Verify the regex pattern is correct
- Check that the regex delimiters are `/.../ ` (forward slashes)
- Ensure named capture groups are spelled correctly: `(?<text>...)` and `(?<value>...)`

**Variable not interpolating in queries:**
- Verify you're using `$variable_name` syntax in queries
- Check that the variable is defined at the dashboard level
- Test the query manually with a hardcoded value

**Regex not matching:**
- Test your regex pattern with a regex tester (regex101.com)
- Verify your separator doesn't appear in the data itself
- Check for trailing whitespace in query results

**Dropdown is empty:**
- Verify the query returns data
- Check that QuestDB is accessible from Grafana
- Review Grafana logs for error messages

:::tip Multi-Select Variables
This pattern works with multi-select variables too. Enable "Multi-value" in the variable configuration, and users can select multiple options. Use `IN ($variable)` in your queries to handle multiple selected values.
:::

:::tip Variable Preview
Grafana shows a preview of what the dropdown will look like when you configure the regex filter. Use this to verify your pattern is working correctly before applying it.
:::

:::info Related Documentation
- [Grafana variables documentation](https://grafana.com/docs/grafana/latest/dashboards/variables/)
- [Grafana regex filters](https://grafana.com/docs/grafana/latest/dashboards/variables/add-template-variables/#filter-variables-with-regex)
- [concat() function](/docs/reference/function/text/#concat)
- [Grafana QuestDB data source](https://grafana.com/grafana/plugins/questdb-questdb-datasource/)
:::
