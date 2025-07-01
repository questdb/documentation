---
title: Array functions
sidebar_label: Array
description: Array functions reference documentation.
---

This page documents functions for n-dimensional arrays. This isn't an exhaustive
list of all functions that may take an array parameter. For example, financial
functions are listed in [their own section](/docs/reference/function/finance/), whether or
not they can take an array parameter.

## array_avg

`array_avg(array)` returns the average of all the array elements.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_avg(ARRAY[ [1.0, 1.0], [2.0, 2.0] ]);
```

| array_avg |
| --------- |
| 1.5       |

## array_count

`array_count(array)` returns the number of finite elements in the array. The
`NaN` and infinity values are not included in the count.

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
The returned 1D array has the same number of elements as the input array.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_cum_sum(ARRAY[ [1.0, 1.0], [2.0, 2.0] ]);
```

|      array_cum_sum     |
| ---------------------- |
| ARRAY[1.0,2.0,4.0,6.0] |

## array_position

`array_position(array, elem)` returns the position of `elem` inside the 1D `array`. If
`elem` doesn't appear in `array`, it returns `NULL`.

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

`array_sum(array)` returns the sum of all the array elements.

#### Parameter

- `array` — the array

#### Example

```questdb-sql
SELECT array_sum(ARRAY[ [1.0, 1.0], [2.0, 2.0] ]);
```

| array_sum |
| --------- |
| 6.0       |

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

`flatten(array, dim)` removes the dimension `dim` from the array, flattening it
into the next dimension. All elements are still available because the next
dimension's length gets multiplied by the removed dimension's length.

#### Parameters

- `array` — the array
- `dim` — the dimension (1-based) to flatten. Cannot be the last dimension.

#### Example

Flatten a 2D array into a 1D array.

```questdb-sql
SELECT flatten(ARRAY[[1, 2], [3, 4]], 1);
```

|      flatten      |
| ----------------- |
| [1.0,2.0,3.0,4.0] |

## insertion_point

Finds the insertion point of the supplied value into a sorted 1D array. The
array can be sorted ascending or descending, and the function auto-detects this.

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
corresponding row of `left_matrix` and column of `right_matrix`:

`result[row, col] := sum_over_i(left_matrix[row, i] * right_matrix[i, col])`

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
It fills the holes created by shifting with `fill_value`, whose default for a
`DOUBLE` array is `NaN`.

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
| ARRAY[[NaN,1.0],[NaN,3.0]] |

```questdb-sql
SELECT shift(ARRAY[ [1.0, 2.0], [3.0, 4.0] ], -1);
```

|            shift           |
| -------------------------- |
| ARRAY[[2.0,NaN],[4.0,NaN]] |

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
