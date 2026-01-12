---
title: Create Arrays from String Literals
sidebar_label: Array from string literal
description: Cast string literals to array types in QuestDB
---

Cast string literals to array types for use with functions that accept array parameters.

## Solution

To cast an array from a string you need to cast to `double[]` for a vector, or to `double[][]` for a two-dimensional array. You can just keep adding brackets for as many dimensions as the literal has.

This query shows how to convert a string literal into an array, even when there are new lines:

```questdb-sql demo title="Cast string to array"
SELECT CAST('[
  [ 1.0, 2.0, 3.0 ],
  [
    4.0,
    5.0,
    6.0
  ]
]' AS double[][]),
cast('[[1,2,3],[4,5,6]]' as double[][]);
```

Note if you add the wrong number of brackets (for example, in this case if you try casting to `double[]` or `double[][][][]`), it will not error, but will instead convert as null.

:::info Related Documentation
- [CAST function](/docs/query/sql/cast/)
- [Data types](/docs/query/datatypes/overview/)
:::
