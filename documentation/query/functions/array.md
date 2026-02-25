---
title: Array functions
sidebar_label: Array
description: Array functions reference documentation.
---

This page documents functions for n-dimensional arrays. This isn't an exhaustive
list of all functions that may take an array parameter. For example, financial
functions are listed in [their own section](/docs/query/functions/finance/), whether or
not they can take an array parameter.

## array_avg

`array_avg(array)` returns the average of all the array elements. `NULL` elements
don't contribute to either count or sum.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_avg(ARRAY[ [1.0, 1.0], [2.0, 2.0] ]);
```

| array_avg |
| --------- |
| 1.5       |

## array_build

`array_build(nArrays, size, filler1 [, filler2, ...])` constructs a `DOUBLE`
array at runtime, where the length and contents can vary per row.

Use `array_build` when the `ARRAY[...]` literal syntax is not enough — for
example when you need to:

- **Fill an array with a scalar** — create a zero vector, or fill every
  position with a computed value (like `array_max`)
- **Stack arrays into a 2D matrix** — combine several 1D arrays into a single
  `DOUBLE[][]` for downstream array operations

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `nArrays` | How many sub-arrays the output has. Must be an integer literal (not a column, expression, or bind variable). `1` produces a 1D `DOUBLE[]`. `2` or more produces a 2D `DOUBLE[][]` with `nArrays` sub-arrays, each of length `size`. |
| `size` | Length of each sub-array. Can be an `INT`/`LONG` value, or a `DOUBLE[]` array — in which case the array's element count is used as the length. |
| `filler1 .. fillerN` | One filler per sub-array (exactly `nArrays` fillers required). A **scalar** (`DOUBLE`/`INT`/`LONG`) is repeated for every position. A **`DOUBLE[]` array** is copied position-by-position: if shorter than `size`, remaining positions are `NaN`; if longer, excess elements are ignored. |

All arguments except `nArrays` can be constants, declared variables, column
references, or expressions evaluated per row.

#### Return type

- `DOUBLE[]` when `nArrays` is `1`
- `DOUBLE[][]` when `nArrays` is `2` or more — the first dimension has length
  `nArrays`, the second has length `size`

The output is always 1D or 2D. Passing a large `nArrays` (e.g. 100) produces a
2D array with 100 rows, not a 100-dimensional array.

#### Examples

**Create an array filled with a scalar value:**

```questdb-sql demo title="array_build - scalar fill"
SELECT array_build(1, 3, 0) FROM long_sequence(1);
```

| array_build    |
| -------------- |
| [0.0,0.0,0.0]  |

**Variable-length fill — size from a column:**

```questdb-sql demo title="array_build - variable-length fill"
SELECT x, array_build(1, x::int, -1) FROM long_sequence(3);
```

| x | array_build        |
|---|--------------------|
| 1 | [-1.0]             |
| 2 | [-1.0,-1.0]        |
| 3 | [-1.0,-1.0,-1.0]   |

Each row gets an array whose length equals `x`, filled with `-1`.

**Broadcast a computed value across an array:**

On the [demo `market_data` table](/docs/cookbook/demo-data-schema/#market_data-table),
`bids` is a `DOUBLE[][]` where `bids[1]` contains bid prices. The following
creates an array the same length as `bids[1]`, filled with its maximum value:

```questdb-sql demo title="array_build - broadcast computed scalar"
SELECT array_build(1, bids[1], array_max(bids[1]))
FROM market_data
LIMIT 1;
```

Here `bids[1]` in the `size` position is a `DOUBLE[]`, so its element count
determines the output length. The filler `array_max(bids[1])` is a scalar, so
it is repeated in every position.

**Copy an existing array:**

When both `size` and the filler are the same `DOUBLE[]`, the filler is copied
position-by-position — effectively cloning the array:

```questdb-sql demo title="array_build - copy an array"
SELECT array_build(1, bids[1], bids[1])
FROM market_data
LIMIT 1;
```

The result is a new `DOUBLE[]` with the same length and values as `bids[1]`.

**NaN padding when the filler array is shorter than `size`:**

```questdb-sql demo title="array_build - NaN padding"
SELECT array_build(1, 5, ARRAY[10.0, 20.0, 30.0]) FROM long_sequence(1);
```

| array_build               |
| ------------------------- |
| [10.0,20.0,30.0,NaN,NaN]  |

Positions beyond the filler's length are filled with `NaN` (which QuestDB
treats as `NULL` for `DOUBLE` values).

**2D array with scalar fill:**

```questdb-sql demo title="array_build - 2D scalar fill"
SELECT array_build(2, 3, 1.0, 0.0) FROM long_sequence(1);
```

| array_build                    |
| ------------------------------ |
| [[1.0,1.0,1.0],[0.0,0.0,0.0]]  |

Two fillers are required because `nArrays` is `2`. The first filler (`1.0`)
fills the first row, the second (`0.0`) fills the second row.

**Combine existing arrays into a 2D matrix:**

```questdb-sql demo title="array_build - 2D from market data"
SELECT array_build(2, bids[1], bids[1], asks[1])
FROM market_data
LIMIT 1;
```

Returns a `DOUBLE[][]` where the first row contains bid prices and the second
row contains ask prices, both taken from the order book snapshot.

**Stack multiple array columns into a 2D array:**

When a table has several `DOUBLE[]` columns, `array_build` can stack them into
a single 2D array. The `market_data` table on the
[demo instance](/docs/cookbook/demo-data-schema/#market_data-table) stores order
book snapshots with `bids` and `asks` as `DOUBLE[][]` columns (run
`SHOW COLUMNS FROM market_data;` on demo to see the schema). Each contains
price and volume sub-arrays: `bids[1]` = bid prices, `bids[2]` = bid volumes,
and likewise for `asks`.

The following packs all four sub-arrays into a single `DOUBLE[4][N]` array:

```questdb-sql demo title="array_build - stack 4 arrays"
SELECT array_build(4, bids[1], bids[1], bids[2], asks[1], asks[2])
FROM market_data
LIMIT 1;
```

The `size` argument (`bids[1]`) is a `DOUBLE[]`, so its element count
determines the sub-array length. Each of the four fillers is also a `DOUBLE[]`,
copied position-by-position into its respective sub-array.

#### Constraints and edge cases

- `nArrays` must be at least `1`. Passing `0` raises an error.
- `size = 0` produces an empty array. `size < 0` raises an error. If `size`
  evaluates to `NULL`, the result is a `NULL` array.
- Fillers must be scalars or 1D `DOUBLE[]` arrays. Multi-dimensional array
  fillers are not accepted.
- `NaN` values inside a filler array are copied as-is. A `NULL` filler array
  fills the entire row with `NaN`.
- Both `nArrays` and `size` are capped at 268,435,455. The total element count
  (`nArrays × size`) must also fit within memory limits.

## array_count

`array_count(array)` returns the number of finite elements in the array. `NULL`
elements do not contribute to the count.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT
  array_count(ARRAY[ [1.0, null], [null, 2.0] ]) c1,
  array_count(ARRAY[ [0.0/0.0, 1.0/0.0], [-1.0/0.0, 0.0/0.0] ]) c2;
```

| c1 |  c2 |
| ---| --- |
| 2  |  0  |

## array_cum_sum

`array_cum_sum(array)` returns a 1D array of the cumulative sums over the array,
traversing it in row-major order. The input array can have any dimensionality.
The returned 1D array has the same number of elements as the input array. `NULL`
elements behave as if they were zero.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_cum_sum(ARRAY[ [1.0, 1.0], [2.0, 2.0] ]);
```

|      array_cum_sum     |
| ---------------------- |
| ARRAY[1.0,2.0,4.0,6.0] |

## array_max

`array_max(array)` returns the maximum value from all the array elements. `NULL`
elements and non-finite values (NaN, Infinity) are ignored. If the array
contains no finite values, the function returns `NULL`.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_max(ARRAY[ [1.0, 5.0], [3.0, 2.0] ]);
```

| array_max |
| --------- |
| 5.0       |

## array_min

`array_min(array)` returns the minimum value from all the array elements. `NULL`
elements and non-finite values (NaN, Infinity) are ignored. If the array
contains no finite values, the function returns `NULL`.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_min(ARRAY[ [1.0, 5.0], [3.0, 2.0] ]);
```

| array_min |
| --------- |
| 1.0       |

## array_position

`array_position(array, elem)` returns the position of `elem` inside the 1D `array`. If
`elem` doesn't appear in `array`, it returns `NULL`. If `elem` is `NULL`, it returns the
position of the first `NULL` element, if any.

#### Parameters

- `array` — the 1D array
- `elem` — the element to look for

#### Examples

```questdb-sql
SELECT
  array_position(ARRAY[1.0, 2.0], 1.0) p1,
  array_position(ARRAY[1.0, 2.0], 3.0) p2;
```

| p1 | p2   |
| -- | ---- |
| 1  | NULL |

## array_sum

`array_sum(array)` returns the sum of all the array elements. `NULL` elements
behave as if they were zero.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_sum(ARRAY[ [1.0, 1.0], [2.0, 2.0] ]);
```

| array_sum |
| --------- |
| 6.0       |

## array_stddev

`array_stddev(array)` returns the sample standard deviation of all the array
elements. This is an alias for `array_stddev_samp()`. `NULL` elements and
non-finite values (NaN, Infinity) are ignored. If the array contains fewer than
2 finite values, the function returns `NULL`.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_stddev(ARRAY[ [1.0, 2.0], [3.0, 4.0] ]);
```

| array_stddev |
| ------------ |
| 1.29099445   |

## array_stddev_pop

`array_stddev_pop(array)` returns the population standard deviation of all the
array elements. `NULL` elements and non-finite values (NaN, Infinity) are
ignored. The population standard deviation uses N in the denominator of the
standard deviation formula. If the array contains no finite values, the function
returns `NULL`.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_stddev_pop(ARRAY[ [1.0, 2.0], [3.0, 4.0] ]);
```

| array_stddev_pop |
| ---------------- |
| 1.11803399       |

## array_stddev_samp

`array_stddev_samp(array)` returns the sample standard deviation of all the
array elements. `NULL` elements and non-finite values (NaN, Infinity) are
ignored. The sample standard deviation uses N-1 in the denominator of the
standard deviation formula. If the array contains fewer than 2 finite values,
the function returns `NULL`.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_stddev_samp(ARRAY[ [1.0, 2.0], [3.0, 4.0] ]);
```

| array_stddev_samp |
| ----------------- |
| 1.29099445        |

## dim_length

`dim_length(array, dim)` returns the length of the n-dimensional array along
dimension `dim`.

#### Parameters

- `array` — the array
- `dim` — the dimension (1-based) whose length to get

#### Example

Get the length of the array along the 1st dimension.

```questdb-sql
SELECT dim_length(ARRAY[42, 42], 1);
```

|  dim_length  |
| ------------ |
|       2      |

## dot_product

`dot_product(left_array, right_array)` returns the dot-product of the two
arrays, which must be of the same shape. The result is equal to
`array_sum(left_array * right_array)`.

#### Parameters

- `left_array` — the left array
- `right_array` — the right array

#### Example

```questdb-sql
SELECT dot_product(
  ARRAY[ [3.0, 4.0], [2.0, 5.0] ],
  ARRAY[ [3.0, 4.0], [2.0, 5.0] ]
);
```

| dot_product |
| ----------- |
| 54.0        |

## flatten

`flatten(array)` flattens all the array's elements into a 1D array, in row-major
order.

#### Parameters

- `array` — the array

#### Example

Flatten a 2D array.

```questdb-sql
SELECT flatten(ARRAY[[1, 2], [3, 4]]);
```

|      flatten      |
| ----------------- |
| [1.0,2.0,3.0,4.0] |

## insertion_point

Finds the insertion point of the supplied value into a sorted 1D array. The
array can be sorted ascending or descending, and the function auto-detects this.

:::warning

The array must be sorted, and must not contain `NULL`s, but this function
doesn't enforce it. It runs a binary search for the value, and the behavior with
an unsorted array is unspecified.

:::

#### Parameters

- `array` — the 1D array
- `value` — the value whose insertion point to look for
- `ahead_of_equal` (optional, default `false`) — when true (false), returns the
  insertion point before (after) any elements equal to `value`

#### Examples

```questdb-sql
SELECT
  insertion_point(ARRAY[1.0, 2.0, 3.0], 2.5) i1,
  insertion_point(ARRAY[1.0, 2.0, 3.0], 2.0) i2,
  insertion_point(ARRAY[1.0, 2.0, 3.0], 2.0, true) i3;
```

| i1 | i2 | i3 |
| -- | -- | -- |
| 3  | 3  | 2  |

## matmul

`matmul(left_matrix, right_matrix)` performs matrix multiplication. This is an
operation from linear algebra.

A matrix is represented as a 2D array. We call the first matrix coordinate "row"
and the second one "column".

`left_matrix`'s number of columns (its dimension 2) must be equal to
`right_matrix`'s number of rows (its dimension 1).

The resulting matrix has the same number of rows as `left_matrix` and the same
number of columns as `right_matrix`. The value at every (row, column) position
in the result is equal to the sum of products of matching elements in the
corresponding row of `left_matrix` and column of `right_matrix`. In a formula,
with C = A x B:

$$

C_{jk} = \sum_{i=1}^{n} A_{ji} B_{ik}

$$

#### Parameters

- `left_matrix`: the left-hand matrix. Must be a 2D array
- `right_matrix`: the right-hand matrix. Must be a 2D array with as many rows as
  there are columns in `left_matrix`

#### Example

Multiply the matrices:

$$

\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix}
\times
\begin{bmatrix}
2 & 3 \\
2 & 3
\end{bmatrix}
=
\begin{bmatrix}
6 & 9 \\
14 & 21
\end{bmatrix}

$$

```questdb-sql
SELECT matmul(ARRAY[[1, 2], [3, 4]], ARRAY[[2, 3], [2, 3]]);
```

|          matmul           |
| ------------------------- |
|  [[6.0,9.0],[14.0,21.0]]  |

## shift

`shift(array, distance, [fill_value])` shifts the elements in the `array`'s last
(deepest) dimension by `distance`. The distance can be positive (right shift) or
negative (left shift). More formally, it moves elements from position `i` to
`i + distance`, dropping elements whose resulting position is outside the array.
It fills the holes created by shifting with `fill_value`, the default being
`NULL`.

#### Parameters

- `array` — the array
- `distance` — the shift distance
— `fill_value` — the value to place in empty slots after shifting

#### Example

```questdb-sql
SELECT shift(ARRAY[ [1.0, 2.0], [3.0, 4.0] ], 1);
```

|            shift           |
| -------------------------- |
| ARRAY[[null,1.0],[null,3.0]] |

```questdb-sql
SELECT shift(ARRAY[ [1.0, 2.0], [3.0, 4.0] ], -1);
```

|            shift           |
| -------------------------- |
| ARRAY[[2.0,null],[4.0,null]] |

```questdb-sql
SELECT shift(ARRAY[ [1.0, 2.0], [3.0, 4.0] ], -1, 10.0);
```

|             shift            |
| ---------------------------- |
| ARRAY[[2.0,10.0],[4.0,10.0]] |

## transpose

`transpose(array)` transposes an array, reversing the order of its coordinates.
This is most often used on a matrix, swapping its rows and columns.

#### Example

Transpose the matrix:

$$

    \begin{bmatrix}
    1 & 2 \\
    3 & 4
    \end{bmatrix}
^T
=
\begin{bmatrix}
1 & 3 \\
2 & 4
\end{bmatrix}

$$

```questdb-sql
SELECT transpose(ARRAY[[1, 2], [3, 4]]);
```

|        transpose        |
| ----------------------- |
|  [[1.0,3.0],[2.0,4.0]]  |
