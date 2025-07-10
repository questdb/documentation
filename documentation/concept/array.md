---
title: N-Dimensional array
sidebar_label: N-Dim array
description: Explains the technical design and syntax to use N-dimensional arrays.
---

:::note

N-dimensional arrays are still in Beta phase. The only supported element type is
`DOUBLE`.

:::

QuestDB version 9.0.0 onwards supports the N-dimensional array type.

Its design matches that of the `NDArray` type in NumPy, which has become the
de-facto standard for handling N-dimensional data.
In order to effectively use arrays in QuestDB, it may help to understand the
basic design principles behind it.

The physical layout of the N-dimensional array is a single memory block with
values arranged (by default) in _row-major_ order, where the coordinates
of the adjacent elements differ in the rightmost coordinate first (much like
the adjacent numbers differ in the rightmost digit first: 41, 42, 43, etc.)

Separately, there are two lists of integers that describe this block of values,
and give it its N-dimensional appearance: _shape_ and _strides_. Both have
length equal to the number of dimensions.

- the numbers in _shape_ tell the length along each dimension -- the range of
values you can use as a coordinate for that dimension
- the numbers in _strides_ tell how far apart are adjacent elements along that
dimension.

Unlike NumPy, QuestDB expresses strides as element jumps, not byte
count jumps. Strides are used to perform a number of operations (such as
transpose, slicing, etc) without the need to copy the array data itself.

Here's a visual example of a 3-dimensional array of type `DOUBLE[2][3][2]`:

```text
dim 1: |. . . . . .|. . . . . .| -- stride = 6, len = 2
dim 2: |. .|. .|. .|. .|. .|. .| -- stride = 2, len = 3
dim 3: |.|.|.|.|.|.|.|.|.|.|.|.| -- stride = 1, len = 2
```

The dots are the individual values (`DOUBLE` numbers in our case). Each row
shows the whole array, but with different subdivisions according to the
dimension. So, in `dim 1`, the row is divided into two slots, the sub-arrays at
coordinates 1 and 2 along that dimension, and the distance between the start of
slot 1 and slot 2 is 6 (the stride for that dimension). In `dim 3`, each slot
contains an individual number, and the stride is 1.

The legal values for the coordinate in `dim 3` are just 1 and 2, even though you
would be able to access any array element just by using a large-enough number.
This is how the flat array gets its 3-dimensional appearance: for each value,
there's a unique list of coordinates, `[i, j, k]`, that addresses it.

The relevance of all this to you as the user is that QuestDB can perform all of
the following operations cheaply, by editing just the two small lists, `shape`
and `strides`, and doing nothing to the potentially huge block of memory holding
the array values:

1. _Slice_: extract a 3-dimensional array that is just a part of the full one,
   by constraining the range of legal coordinates at each dimension. Example:
   `array[1:2, 2:4, 1:2]` will give us a view into the array with the shape
   `DOUBLE[1, 2, 1]`, covering just the ranges of coordinates indicated in the
   expression.

2. _Take a sub-array_: constrain the coordinate at a given dimension to just one
   choice, and then eliminate that dimension from the array. Example:
   `array[2]` has the shape `DOUBLE[3, 2]` and consists of the second subarray
   in the 1st dimension.

3. _Flatten_: remove a dimension from the array, flattening it into the
   next-finer dimension. Example: flattening `dim 2` gives us an array shape
   `DOUBLE[2, 6]`. All elements are still available, but using just 2
   coordinates.

4. _Transpose_: reverse the shape and the strides, changing the meaning of each
   coordinate. Example: transposing our array changes the strides from
   `(6, 2, 1)` to `(1, 2, 6)`. What we used to access with the 3rd coordinate,
   we now access with the 1st coordinate. On a 2D array, this would have the
   effect of swapping rows and columns (transposing a matrix).

## Importance of the "vanilla" array shape

QuestDB stores the _shape_ along with the array. However, it has no need to
store _strides_: they can be calculated from the shape. Strides become relevant
once you perform one of the mentioned array shape transformations. We say that
an array whose shape hasn't been transformed (that is, it matches the physical
arrangement of elements) is a _vanilla_ array, and this has consequences for
performance. A vanilla array can be processed by optimized bulk operations that
go over the entire block of memory, disregarding the shape and strides, whereas
for any other array we have to step through all the coordinates one by one and
calculate the position of each element.

So, while performing a shape transformation is cheap on its own, whole-array
operations on transformed arrays, such as equality checks, adding/multiplying
two arrays, etc., are expected to be faster on vanilla arrays.

QuestDB always stores arrays in vanilla form. If you transform an array's shape
and then store it to the database, QuestDB will physically rearrange the
elements, and store the new array in vanilla shape.

## The ARRAY literal

You can create an array from scalar values using the `ARRAY[...]` syntax, as
in this example:

```questdb-sql
CREATE TABLE tango AS (SELECT ARRAY[
   [ [ 1,  2,  3], [ 4,  5,  6], [ 7,  8,  9] ],
   [ [10, 11, 12], [13, 14, 15], [16, 17, 18] ],
   [ [19, 20, 21], [22, 23, 24], [25, 26, 27] ]
] arr from long_sequence(1));
```

Values can be any expressions that yield scalars, so you can construct the array
from existing column data.

Values can also be arrays, creating a higher-dimensional array:

```questdb-sql
CREATE TABLE tango AS (SELECT ARRAY[1, 2] arr, ARRAY[3, 4] brr FROM long_sequence(1));
SELECT ARRAY[arr, brr] FROM tango;
```

|       array_2d        |
| --------------------- |
| [[1.0,2.0],[3.0,4.0]] |

## Array access syntax

We model our N-dimensional array access syntax on Python's `NDArray`, except that
we inherit 1-based indexing from SQL. This is the syntax:

```questdb-sql
arr[<dim1-selector>, <dim2-selector>, ...]
```

Each `dimN-selector` can be one of two forms:

- single integer
- range in the form `low:high`

All the following examples use the 3D array named `arr`, of type
`DOUBLE[3][3][3]`:

```questdb-sql
CREATE TABLE tango AS (SELECT ARRAY[
   [ [ 1,  2,  3], [ 4,  5,  6], [ 7,  8,  9] ],
   [ [10, 11, 12], [13, 14, 15], [16, 17, 18] ],
   [ [19, 20, 21], [22, 23, 24], [25, 26, 27] ]
] arr from long_sequence(1));
```

### Single-integer array selector

Using single integers you select individual array elements. An element of a 2D
array is a 1D sub-array, and an element of a 1D array is an individual scalar
value, like a `DOUBLE`. If you use a coordinate larger than the array's given
dimension length, the result will be `NULL` for scalars, and an empty array for
sub-arrays.

#### Example: select a number from the array

```questdb-sql
SELECT arr[1, 3, 2] elem FROM tango;
```

| elem |
| ---- |
| 8.0  |

This selected the `DOUBLE` number at the coordinates (1, 3, 2). Remember that the
coordinates are 1-based!

:::tip

The syntax `arr[1, 3, 2]` is interchangeable with `arr[1][3][2]`. The performance of
both styles is the same.

:::

#### Example: select an out-of-range element from the array

```questdb-sql
SELECT arr[1, 3, 4] elem FROM tango;
```

| elem |
| ---- |
| NULL |

#### Example: select a 2D sub-array

```questdb-sql
SELECT arr[1] subarr FROM tango;
```

|                   subarr                    |
| ------------------------------------------- |
| [[1.0,2.0,3.0],[4.0,5.0,6.0],[7.0,8.0,9.0]] |

This selected the first 2D sub-array in `arr`.

#### Example: select a sub-array that is out-of-range

```questdb-sql
SELECT arr[4] subarr FROM tango;
```

| subarr |
| ------ |
| []     |

#### Example: select a 1D sub-array

```questdb-sql
SELECT arr[1, 3] subarr FROM tango;
```

|    subarr     |
| ------------- |
| [7.0,8.0,9.0] |

This selected the first 2D-subarray in `arr`, and then the 3rd 1D-subarray in
it.

### Range selector - slicing

A range of integers selects a slice of the array. You can think of slicing as
leaving the array intact, but constraining the range of numbers you can use for
a coordinate. The lowest valid coordinate remains `1`, but it gets remapped to
the coordinate indicated by the lower bound of the slicing range.

The dimensionality of the result remains the same, even if the range contains
just one number. The slice includes the lower bound, but excludes the upper
bound.

You can omit the upper bound, like this: `arr[2:]`. The slice will then extend
to the end of the array in the corresponding dimension. The lower bound is
mandatory, due to syntax conflict with variable placeholders such as `:a` or
`:2`.

If the upper bound of the range exceeds the array's length, the result
is the same as if the upper bound was left out — the result extends to the
end of the array along that dimension.

#### Example: select a slice of `arr` by constraining the first dimension

```questdb-sql
SELECT arr[2:3] slice FROM tango;
```

|                         slice                          |
| ------------------------------------------------------ |
| [[[10.0,11.0,12.0],[13.0,14.0,15.0],[16.0,17.0,18.0]]] |

This returned a `DOUBLE[1][3][3]`, containing just the second sub-array of
`arr`.

#### Example: select a slice of `arr` with a right-open range

```questdb-sql
SELECT arr[2:] slice FROM tango;
```

|                          slice                            |
| --------------------------------------------------------- |
|  [[[10.0,11.0,12.0],[13.0,14.0,15.0],[16.0,17.0,18.0]],<br />[[19.0,20.0,21.0],[22.0,23.0,24.0],[25.0,26.0,27.0]]]  |

This returned a `DOUBLE[2][3][3]` and contains everything except the first
sub-array along the first dimension.

#### Example: Select a slice of `arr` by constraining the first and second dimensions

```questdb-sql
SELECT arr[2:3, 3:4] slice FROM tango;
```

|          slice         |
| ---------------------- |
|  [[[16.0,17.0,18.0]]]  |

Note that the returned array is still 3D.

#### Example: select a slice of `arr` with large upper bounds

```questdb-sql
SELECT arr[2:100, 3:100] slice FROM tango;
```

|                   slice                   |
| ----------------------------------------- |
|  [[[16.0,17.0,18.0]],[[25.0,26.0,27.0]]]  |

The result is the same same as if using `arr[2:, 3:]`.

### Mixing selectors

You can use both types of selectors within the same bracket expression.

#### Example: select the first sub-array of `arr`, and slice it

```questdb-sql
SELECT arr[1, 2:4] subarr FROM tango;
```

|             subarr              |
| ------------------------------- |
|  [[4.0,5.0,6.0],[7.0,8.0,9.0]]  |

This returned a `DOUBLE[2][3]`. The top dimension is gone because the first
selector took out a sub-array and not a one-element slice.

#### Example: select discontinuous elements from sub-arrays

```questdb-sql
SELECT arr[1:, 3, 2] subarr FROM tango;
```

|      subarr       |
| ----------------- |
|  [8.0,17.0,26.0]  |

This left the top dimension unconstrained, then took the 3rd sub-array in
each of the top-level sub-arrays, and then selected just the 2nd element in each
of them.
