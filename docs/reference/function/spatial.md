---
title: Geospatial functions
sidebar_label: Spatial
description: Geospatial functions reference documentation.
---

Spatial functions allow for operations relating to the geohash types which
provide geospatial data support. For more information on this type of data, see
the [geohashes documentation](/docs/concept/geohashes/) and the
[operators](/docs/reference/operators/spatial/) which help with filtering data.

## rnd_geohash

`rnd_geohash(bits)` returns a random geohash of variable precision.

**Arguments:**

`bits` - an integer between `1` and `60` which determines the precision of the
generated geohash.

**Return value:**

Returns a `geohash`

**Examples:**

```questdb-sql
SELECT rnd_geohash(7) g7,
      rnd_geohash(10) g10,
      rnd_geohash(30) g30,
      rnd_geohash(29) g29,
      rnd_geohash(60) g60
FROM long_sequence(5);
```

| g7      | g10 | g30    | g29                           | g60          |
| ------- | --- | ------ | ----------------------------- | ------------ |
| 1101100 | 4h  | hsmmq8 | 01110101011001101111110111011 | rjtwedd0z72p |
| 0010011 | vf  | f9jc1q | 10101111100101111111101101101 | fzj09w97tj1h |
| 0101011 | kx  | fkhked | 01110110010001001000110001100 | v4cs8qsnjkeh |
| 0000001 | 07  | qm99sm | 11001010011011000010101100101 | hrz9gq171nc5 |
| 0101011 | 6t  | 3r8jb5 | 11011101010111001010010001010 | fm521tq86j2c |

## make_geohash

`make_geohash(lon, lat, bits)` returns a geohash equivalent of latitude and
longitude, with precision specified in bits.

`make_geohash()` is intended to be used via SQL over HTTP / PostgreSQL wire
protocol, for use within Java (embedded) scenario, see the
[Java embedded documentation for geohashes](/docs/concept/geohashes/#java-embedded-usage).

**Arguments:**

- `lon` - longitude coordinate as a floating point value with up to eight
  decimal places
- `lat` - latitude coordinate as a floating point value with up to eight decimal
  places
- `bits` - an integer between `1` and `60` which determines the precision of the
  generated geohash.

The latitude and longitude arguments may be constants, column values or the
results of a function which produces them.

**Return value:**

Returns a `geohash`.

- If latitude and longitude comes from constants and is incorrect, an error is
  thrown
- If column values have invalid lat / long coordinates, this produces `null`.

**Examples:**

```questdb-sql
SELECT make_geohash(142.89124148, -12.90604153, 40)
```
