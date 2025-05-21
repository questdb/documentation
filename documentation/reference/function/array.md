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

## flatten

`flatten(array, dim)` removes the dimension `dim` from the array, flattening it
into the next dimension. All elements are still available because the next
dimension's length gets multiplied by the removed dimension's length.

Example: given an array of shape `DOUBLE[2][3][2]`, `flatten(array, 2)` gives us
an array of shape `DOUBLE[2, 6]`. The second dimension is gone, and the third
dimension's length increased from 2 to 3 \* 2 = 6.

### Parameters

- `array` — the array
- `dim` — the dimension (1-based) to flatten. Cannot be the last dimension.

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

## transpose

`transpose(array)` transposes an array, reversing the order of its coordinates.
Example: given `array: DOUBLE[2, 5]`, `result = transpose(array)` returns an
array of shape `DOUBLE[5, 2]`, such that `array[i, j] = result[j, i]` for any
valid `i` and `j` coordinates.
