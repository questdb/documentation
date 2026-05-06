---
title: CASE keyword
sidebar_label: CASE
description: CASE SQL keyword reference documentation.
---

## Syntax

```questdb-sql
CASE
    WHEN condition THEN value
    [WHEN condition THEN value ...]
    [ELSE value]
END
```

## Description

`CASE` goes through a set of conditions and returns a value corresponding to the
first condition met. Each new condition follows the `WHEN condition THEN value`
syntax. The user can define a return value when no condition is met using
`ELSE`. If `ELSE` is not defined and no conditions are met, then case returns
`null`.

## Examples

Tag each trade as bullish or bearish based on its side, using `ELSE` as the
fallback:

```questdb-sql title="CASE with ELSE" demo
SELECT symbol, side,
    CASE
        WHEN side = 'buy' THEN 'bullish'
        ELSE 'bearish'
    END AS sentiment
FROM trades
LIMIT -40;
```

| symbol  | side | sentiment |
| ------- | ---- | --------- |
| BTC-USD | buy  | bullish   |
| ETH-USD | sell | bearish   |
| BTC-USD | buy  | bullish   |
| SOL-USD | sell | bearish   |

Without `ELSE`, unmatched rows produce `null`:

```questdb-sql title="CASE without ELSE" demo
SELECT symbol, side,
    CASE
        WHEN side = 'buy' THEN 'bullish'
    END AS sentiment
FROM trades
LIMIT -40;
```

| symbol  | side | sentiment |
| ------- | ---- | --------- |
| BTC-USD | buy  | bullish   |
| ETH-USD | sell | null      |
| BTC-USD | buy  | bullish   |
| SOL-USD | sell | null      |
