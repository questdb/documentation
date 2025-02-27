---
title: UNPIVOT keyword
sidebar_label: UNPIVOT
description: UNPIVOT SQL keyword reference documentation.
---

`UNPIVOT` allows you to pivot columns into rows. This allows you to condense values from
multiple columns into a single column.

This syntax is supported within `SELECT` queries.

## Syntax

![Flow chart showing the syntax of the UNPIVOT keyword](/images/docs/diagrams/unpivot.svg)

## Mechanics

The `UNPIVOT` keyword comes after a general table select.

There are two components:

#### Value Column

This column will contain the values copied from the unpivot columns;

#### Unpivot Columns

This column appears after the `FOR` keyword, and contains the names of the columns from which values will be taken.


### PIVOT/UNPIVOT Round Trip

One of the easier ways to demonstrate `UNPIVOT` is to combine it with `PIVOT`.

Let's take the following `PIVOT` query:

```questdb-sql title="basic PIVOT" demo
(trades LIMIT 1000) 
    PIVOT (
      avg(price) 
      FOR symbol IN ('BTC-USD', 'ETH-USD')
    );
```

| BTC-USD            | ETH-USD           |
| ------------------ | ----------------- |
| 39282.200736543906 | 2616.588454404948 |

As you can see, the result set contains two columns, with names originating from the `symbol` column,
and values originating from the `price` column.

This data is now column modelled. If we want to convert it back to row-modelled, we can
use `UNPIVOT`.

```questdb-sql title="round trip" demo
(
  (trades LIMIT 1000) 
    PIVOT (
      avg(price) 
      FOR symbol IN ('BTC-USD', 'ETH-USD')
    )
) UNPIVOT (
    avg_price
    FOR symbol IN ('BTC-USD', 'ETH-USD')
  );
```

| symbol  | avg_price          |
| ------- |--------------------|
| BTC-USD | 39282.200736543906 |
| ETH-USD | 2616.588454404948  |

In this `UNPIVOT` query, we transpose the column names `('BTC-USD', 'ETH-USD')` into
the `symbol` column, with their matching values in a


### Basic unpivot

```questdb-sql title="basic UNPIVOT" demo
(select timestamp, 
        symbol, 
        side, 
        ask_px_00, 
        ask_px_01, 
        ask_px_02, 
        ask_px_03 
    FROM AAPL_orderbook LIMIT 1000
    ) UNPIVOT (
      prices
      FOR price_type IN (
        'ask_px_00', 
        'ask_px_01', 
        'ask_px_02', 
        'ask_px_03')
    )
```
