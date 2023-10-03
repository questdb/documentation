---
title: Trigonometric functions
sidebar_label: Trigonometric
description: Trigonometric function reference documentation.
---

This page describes the available functions to assist with performing
trigonometric calculations.

:::tip

Positive and negative infinity values are expressed as `'Infinity'` or
`'-Infinity'` in QuestDB.

:::

## sin

`sin(angleRadians)` returns the trigonometric sine of an angle.

### Arguments

- `angleRadians` is a numeric value indicating the angle in radians.

### Return value

Return value type is `double`.

### Description

Special case: if the argument is `NaN` or an infinity, then the result is `Null`.

### Examples

```questdb-sql
SELECT pi()/2 angle, sin(pi()/2) sin;
```

| angle          | sin |
| -------------- | --- |
| 1.570796326794 | 1   |

## cos

`cos(angleRadians)` returns the trigonometric cosine of an angle.

### Arguments

- `angleRadians` numeric value for the angle, in radians.

### Return value

Return value type is `double`.

### Description

Special case: if the argument is `NaN` or an infinity, then the result is `Null`.

### Examples

```questdb-sql
SELECT pi()/2 angle, cos(pi()/2) cos;
```

| angle          | cos                   |
| -------------- | --------------------- |
| 1.570796326794 | 6.123233995736766e-17 |

## tan

`tan(angleRadians)` returns the trigonometric tangent of an angle.

### Arguments

- `angleRadians` numeric value for the angle, in radians.

### Return value

Return value type is `double`.

### Description

Special case: if the argument is `NaN` or an infinity, then the result is `Null`.

### Examples

```questdb-sql
SELECT pi()/2 angle, tan(pi()/2) tan;
```

| angle          | tan               |
| -------------- | ----------------- |
| 1.570796326794 | 16331239353195370 |

## cot

`cot(angleRadians)` returns the trigonometric cotangent of an angle.

### Arguments

- `angleRadians` numeric value for the angle, in radians.

### Return value

Return value type is `double`.

### Description

Special case: if the argument is `NaN`, 0, or an infinity, then the result is `Null`.
<!-- - If the argument is 0, then the result is positive infin.
Currently returning null TBD-->

### Examples

```questdb-sql
SELECT pi()/2 angle, cot(pi()/2) cot;
```

| angle          | cot                   |
| -------------- | --------------------- |
| 1.570796326794 | 6.123233995736766e-17 |

## asin

`asin(value)` the arcsine of a value.

### Arguments

- `value` is a numeric value whose arcsine is to be returned.

### Return value

Return value type is `double`. The returned angle is between -pi/2 and pi/2
inclusively.

### Description

Special case: if the argument is `NaN` or an infinity, then the result is `Null`.

### Examples

```questdb-sql
SELECT asin(1.0) asin;
```

| asin           |
| -------------- |
| 1.570796326794 |

## acos

`acos(value)` returns the arccosine of a value.

### Arguments

- `value` is a numeric value whose arccosine is to be returned. The returned
  angle is between 0.0 and pi inclusively.

### Return value

Return value type is `double`.

### Description

Special cases: if the argument is `NaN` or its absolute value is greater than 1, then the
result is `Null`.

### Examples

```questdb-sql
SELECT acos(0.0) acos;
```

| acos           |
| -------------- |
| 1.570796326794 |

## atan

`atan(value)` returns the arctangent of a value.

### Arguments

- `value` is a numeric value whose arctangent is to be returned.

### Return value

Return value type is `double`. The returned angle is between -pi/2 and pi/2
inclusively.

### Description

Special cases:

- If the argument is `NaN`, then the result is `Null`.
- If the argument is infinity, then the result is the closest value to pi/2 with
  the same sign as the input.

### Examples

Special case where input is `'-Infinity'`:

```questdb-sql
SELECT atan('-Infinity');
```

Returns the closest value to pi/2 with the same sign as the input:

| atan            |
| --------------- |
| -1.570796326794 |

```questdb-sql
SELECT atan(1.0) atan;
```

| atan           |
| -------------- |
| 0.785398163397 |

## atan2

`atan2(valueY, valueX)` returns the angle _theta_ from the conversion of
rectangular coordinates (x, y) to polar (r, theta). This function computes
_theta_ (the phase) by computing an arctangent of y/x in the range of -pi to pi
inclusively.

### Arguments

- `valueY` numeric ordinate coordinate.
- `valueX` numeric abscissa coordinate.

:::note

The arguments to this function pass the y-coordinate first and the x-coordinate
second.

:::

### Return value

Return value type is `double` between -pi and pi inclusively.

### Description:

`atan2(valueY, valueX)` measures the counterclockwise angle _theta_, in radians,
between the positive x-axis and the point (x, y):

![Atan2 trigonometric function](/img/docs/atan2.svg)

Special cases:

| input `valueY`        | input `valueX` | `atan2` return value               |
| --------------------- | -------------- | ---------------------------------- |
| 0                     | Positive value | 0                                  |
| Positive finite value | 'Infinity'     | 0                                  |
| -0                    | Positive value | 0                                  |
| Negative finite value | 'Infinity'     | 0                                  |
| 0                     | Negative value | Double value closest to pi         |
| Positive finite value | '-Infinity'    | Double value closest to pi         |
| -0                    | Negative value | Double value closest to -pi        |
| Negative finite value | '-Infinity'    | Double value closest to -pi        |
| Positive value        | 0 or -0        | Double value closest to pi/2       |
| 'Infinity'            | Finite value   | Double value closest to pi/2       |
| Negative value        | 0 or -0        | Double value closest to -pi/2      |
| '-Infinity'           | Finite value   | Double value closest to -pi/2      |
| 'Infinity'            | 'Infinity'     | Double value closest to pi/4       |
| 'Infinity'            | '-Infinity'    | Double value closest to 3/4 \* pi  |
| '-Infinity'           | 'Infinity'     | Double value closest to -pi/4      |
| '-Infinity'           | '-Infinity'    | Double value closest to -3/4 \* pi |

### Examples

```questdb-sql
SELECT atan2(1.0, 1.0) atan2;
```

| atan2          |
| -------------- |
| 0.785398163397 |

## radians

`radians(angleDegrees)` converts an angle measured in degrees to the equivalent
angle measured in radians.

### Arguments

- `angleDegrees` numeric value for the angle in degrees.

### Return value

Return value type is `double`.

### Examples

```questdb-sql
SELECT radians(180);
```

| radians        |
| -------------- |
| 3.141592653589 |

## degrees

`degrees(angleRadians)` converts an angle measured in radians to the equivalent
angle measured in degrees.

### Arguments

- `angleRadians` numeric value for the angle in radians.

### Return value

Return value type is `double`.

### Examples

```questdb-sql
SELECT degrees(pi());
```

| degrees |
| ------- |
| 180     |

## pi

`pi()` returns the constant pi as a double.

### Arguments

None.

### Return value

Return value type is `double`.

### Examples

```questdb-sql
SELECT pi();
```

| pi             |
| -------------- |
| 3.141592653589 |
