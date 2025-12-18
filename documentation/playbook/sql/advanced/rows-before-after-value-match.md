---
title: Find Rows Before and After Value Match
sidebar_label: Rows before/after match
description: Use LAG and LEAD window functions to access values from surrounding rows
---

Access values from rows before and after the current row to find patterns, detect changes, or provide context around events. This is useful for comparing values across adjacent rows or detecting local minimums and maximums.

## Problem: Need Surrounding Context

You want to find all rows in the `core_price` table where the bid price is lower than the prices in the surrounding rows (5 rows before and 5 rows after). This helps identify local price drops or troughs in the EURUSD time series.

## Solution: Use LAG and LEAD Functions

Use `LAG()` to access rows before the current row and `LEAD()` to access rows after:

```questdb-sql demo title="Find rows where bid price is lower than surrounding rows"
WITH framed AS (
  SELECT timestamp, bid_price,
    LAG(bid_price, 1) OVER () AS bidprice_1up,
    LAG(bid_price, 2) OVER () AS bidprice_2up,
    LAG(bid_price, 3) OVER () AS bidprice_3up,
    LAG(bid_price, 4) OVER () AS bidprice_4up,
    LAG(bid_price, 5) OVER () AS bidprice_5up,
    LEAD(bid_price, 1) OVER () AS bidprice_1down,
    LEAD(bid_price, 2) OVER () AS bidprice_2down,
    LEAD(bid_price, 3) OVER () AS bidprice_3down,
    LEAD(bid_price, 4) OVER () AS bidprice_4down,
    LEAD(bid_price, 5) OVER () AS bidprice_5down
  FROM core_price
  WHERE timestamp >= dateadd('m', -1, now()) AND symbol = 'EURUSD'
)
SELECT timestamp, bid_price
FROM framed
WHERE bid_price < bidprice_1up AND bid_price < bidprice_2up AND bid_price < bidprice_3up AND bid_price < bidprice_4up AND bid_price < bidprice_5up
  AND bid_price < bidprice_1down AND bid_price < bidprice_2down AND bid_price < bidprice_3down AND bid_price < bidprice_4down AND bid_price < bidprice_5down
LIMIT 20;
```

This returns all rows where the current bid price is lower than ALL of the surrounding 10 rows (5 before and 5 after), identifying local minimums for EURUSD in the last minute.

## How It Works

The query uses a two-step approach:

1. **Access surrounding rows**: The CTE `framed` uses `LAG()` and `LEAD()` to access values from surrounding rows:
   - `LAG(bid_price, N)`: Gets the bid price from N rows **before** the current row
   - `LEAD(bid_price, N)`: Gets the bid price from N rows **after** the current row

2. **Filter for local minimums**: The outer query uses `AND` conditions to find rows where the current price is lower than ALL surrounding prices, identifying true local minimums

### LAG vs LEAD

- **`LAG(column, offset)`** - Accesses the value from `offset` rows **before** (earlier in time)
- **`LEAD(column, offset)`** - Accesses the value from `offset` rows **after** (later in time)

Both functions return `NULL` for rows where the offset goes beyond the dataset boundaries (e.g., `LAG(5)` returns `NULL` for the first 5 rows).

:::warning Symbol Filter Required
When using window functions without `PARTITION BY`, you must filter by a specific symbol. This ensures the window frame operates on a single symbol's time series, preventing incorrect comparisons across different symbols.
:::

## Viewing Surrounding Values

To see all surrounding values for debugging or analysis, select all the LAG/LEAD columns:

```questdb-sql demo title="Show all surrounding values for inspection"
WITH framed AS (
  SELECT row_number() OVER () as rownum, timestamp, bid_price,
    LAG(bid_price, 1) OVER () AS bidprice_1up,
    LAG(bid_price, 2) OVER () AS bidprice_2up,
    LAG(bid_price, 3) OVER () AS bidprice_3up,
    LAG(bid_price, 4) OVER () AS bidprice_4up,
    LAG(bid_price, 5) OVER () AS bidprice_5up,
    LEAD(bid_price, 1) OVER () AS bidprice_1down,
    LEAD(bid_price, 2) OVER () AS bidprice_2down,
    LEAD(bid_price, 3) OVER () AS bidprice_3down,
    LEAD(bid_price, 4) OVER () AS bidprice_4down,
    LEAD(bid_price, 5) OVER () AS bidprice_5down
  FROM core_price
  WHERE timestamp >= dateadd('m', -1, now()) AND symbol = 'EURUSD'
)
SELECT rownum, timestamp, bid_price,
  bidprice_1up, bidprice_2up, bidprice_3up, bidprice_4up, bidprice_5up,
  bidprice_1down, bidprice_2down, bidprice_3down, bidprice_4down, bidprice_5down
FROM framed
WHERE bid_price < bidprice_1up AND bid_price < bidprice_2up AND bid_price < bidprice_3up AND bid_price < bidprice_4up AND bid_price < bidprice_5up
  AND bid_price < bidprice_1down AND bid_price < bidprice_2down AND bid_price < bidprice_3down AND bid_price < bidprice_4down AND bid_price < bidprice_5down
LIMIT 20;
```

This shows each matching row with all its surrounding bid prices as separate columns, making it easy to verify the local minimum detection.

## Advanced: Checking Against Aggregate Over Large Ranges

For more complex scenarios where you need to compare against the **maximum or minimum** value across a large range (e.g., 100 rows before and after), you can use the `FIRST_VALUE()` trick with reversed ordering:

```questdb-sql demo title="Find rows where price is below the max of surrounding 100 rows"
WITH framed AS (
  SELECT timestamp, bid_price,
    -- Max of 100 rows before
    MAX(bid_price) OVER (ROWS BETWEEN 100 PRECEDING AND 1 PRECEDING) AS max_100_before,
    -- Max of 100 rows after (using DESC ordering trick)
    MAX(bid_price) OVER (ORDER BY timestamp DESC ROWS BETWEEN 100 PRECEDING AND 1 PRECEDING) AS max_100_after
  FROM core_price
  WHERE timestamp >= dateadd('h', -1, now()) AND symbol = 'EURUSD'
)
SELECT timestamp, bid_price, max_100_before, max_100_after
FROM framed
WHERE bid_price < max_100_before AND bid_price < max_100_after
LIMIT 20;
```

This pattern is useful when you need to:
- Check against **aggregates** (MAX, MIN, AVG) over a range rather than individual values
- Work with **large ranges** (50-100+ rows) where listing individual LAG/LEAD calls would be impractical
- Find rows where the current value is below the maximum or above the minimum in a large window

### The Reversed Ordering Trick

To access rows **after** the current row using aggregate functions, use `ORDER BY timestamp DESC`:
- Normal order: `ROWS BETWEEN 100 PRECEDING AND 1 PRECEDING` gives you the 100 rows **before**
- Reversed order: `ORDER BY timestamp DESC ROWS BETWEEN 100 PRECEDING AND 1 PRECEDING` gives you the 100 rows **after** (because descending order reverses what "preceding" means)

This is a workaround since QuestDB doesn't have `ROWS FOLLOWING` syntax yet.

:::tip When to Use Each Approach
- **Use LAG/LEAD**: When you need to compare against **specific individual rows** (e.g., the previous 5 rows, the next 3 rows)
- **Use aggregate with window frames**: When you need to compare against an **aggregate value** (MAX, MIN, AVG) over a **large range** of rows (e.g., highest price in the last 100 rows)
:::

:::info Related Documentation
- [LAG window function](/docs/reference/function/window/#lag)
- [LEAD window function](/docs/reference/function/window/#lead)
- [Window functions overview](/docs/reference/sql/over/)
- [Window frame clauses](/docs/reference/sql/over/#frame-types-and-behavior)
:::
