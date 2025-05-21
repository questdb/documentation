---
title: Array functions
sidebar_label: Array
description: Array functions reference documentation.
---

This page documents functions for n-dimensional arrays. This isn't an exhaustive
list of all functions that may take an array parameter. For example, financial
functions are listed in [their own section](/docs/reference/function/finance/), whether or
not they can take an array parameter.

## dim_length

`dim_length(array, dim)` returns the length of the n-dimensional array along
dimension `dim`.

### Parameters

- `array` — the array
- `dim` — the dimension (1-based) whose length to get

### Example

Get the length of `arr` along the 1st dimension.

```questdb-sql
SELECT dim_length(ARRAY[42, 42], 1);
```

|  dim_length  |
| ------------ |
|       2      |

## flatten

`flatten(array, dim)` removes the dimension `dim` from the array, flattening it
into the next dimension. All elements are still available because the next
dimension's length gets multiplied by the removed dimension's length.

### Parameters

- `array` — the array
- `dim` — the dimension (1-based) to flatten. Cannot be the last dimension.

### Example

```questdb-sql
SELECT flatten(ARRAY[[1, 2], [3, 4]], 1);
```

|       flatten       |
| ------------------- |
|  [1.0,2.0,3.0,4.0]  |

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
corresponding row of `left_matrix` and column of `right_matrix`:

`result[row, col] := sum_over_i(left_matrix[row, i] * right_matrix[i, col])`

### Example

Multiply the matrices:

```text
| 1 2 |   | 2 3 |
|     | x |     |
| 3 4 |   | 2 3 |
```

```questdb-sql
SELECT matmul(ARRAY[[1, 2], [3, 4]], ARRAY[[2, 3], [2, 3]]);
```

|          matmul           |
| ------------------------- |
|  [[6.0,9.0],[14.0,21.0]]  |

## transpose

`transpose(array)` transposes an array, reversing the order of its coordinates.

### Example

Transpose the matrix:

```text
| 1 2 | T     | 1 3 |
|     |    =  |     |
| 3 4 |       | 2 4 |
```

```questdb-sql
SELECT transpose(ARRAY[[1, 2], [3, 4]]);
```

|        transpose        |
| ----------------------- |
|  [[1.0,3.0],[2.0,4.0]]  |
