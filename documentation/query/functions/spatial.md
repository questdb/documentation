---
title: Spatial functions
sidebar_label: Spatial
description: >
  Spatial functions for LIDAR point clouds, robotics, physical AI, and
  geographic coordinate systems. Includes bounding box queries, radius searches,
  distance calculations, and geohash operations.
---

QuestDB provides spatial functions for working with coordinate data across
different domains:

- **Euclidean/Cartesian coordinates** - For LIDAR scans, point clouds, robotics,
  local coordinate systems, and physical AI applications
- **Geographic coordinates** - For latitude/longitude data with distance
  calculations in meters
- **Geohashes** - For encoding geographic locations into compact, indexable
  strings

## Choosing the right function

| Use case | Function | Coordinate system |
| :------- | :------- | :---------------- |
| LIDAR point clouds, robotics, local coordinates | `within_box`, `within_radius` | Euclidean (meters, feet, or any unit) |
| GPS tracking, delivery radius, store locator | `geo_within_radius_latlon`, `geo_distance_meters` | Geographic (lat/lon in degrees) |
| Spatial indexing, prefix-based area queries | `make_geohash` + `within` operator | Geohash-encoded |

**Euclidean functions** treat coordinates as flat 2D space with no Earth
curvature correction. Use these when your data is already in a local coordinate
frame (UTM, state plane, robot-relative) or when working with non-geographic
spatial data.

**Geographic functions** account for Earth's geometry using equirectangular
projection. Use these for lat/lon data where you need real-world distances in
meters.

**Geohash functions** encode locations into hierarchical strings useful for
indexing and prefix-based spatial queries. See
[spatial operators](/docs/query/operators/spatial/) for the `within` operator.

## Euclidean space functions

These functions operate in Euclidean (Cartesian) coordinate space, making them
ideal for:

- **LIDAR point cloud indexing** - Efficiently query 3D scan data stored on
  object storage
- **Robotics and physical AI** - Local coordinate frame calculations for
  navigation and perception
- **CAD/CAM applications** - Spatial queries on design coordinates
- **Gaming and simulation** - 2D/3D world space calculations

All Euclidean functions use standard Cartesian distance calculations without
geodetic corrections.

The examples below use this table schema for LIDAR scan metadata:

```questdb-sql title="LIDAR scans table"
CREATE TABLE lidar_scans (
  ts TIMESTAMP,
  robot_id SYMBOL,
  pose_x DOUBLE,
  pose_y DOUBLE,
  point_count INT,
  scan VARCHAR -- reference to scan data, e.g. 's3://my-bucket/lidar/scan_001.laz'
) TIMESTAMP(ts) PARTITION BY DAY;
```

### within_box

`within_box(x, y, min_x, min_y, max_x, max_y)` - Returns `true` if a point
lies within a rectangular bounding box (inclusive).

Use this function to filter points within axis-aligned rectangular regions.
Common applications include spatial partitioning, tile-based queries, and
rectangular area selection in LIDAR datasets.

**Arguments:**

- `x` - X coordinate of the point to test (double)
- `y` - Y coordinate of the point to test (double)
- `min_x` - Minimum X coordinate of the bounding box (double)
- `min_y` - Minimum Y coordinate of the bounding box (double)
- `max_x` - Maximum X coordinate of the bounding box (double)
- `max_y` - Maximum Y coordinate of the bounding box (double)

**Return value:**

Returns `boolean`:

- `true` if the point is inside or on the boundary of the box
- `false` if the point is outside the box
- `NULL` if any argument is `NULL`

Invalid inputs (such as `NaN`) produce an error.

**Examples:**

```questdb-sql title="Sample data: robot scanning a warehouse"
INSERT INTO lidar_scans VALUES
  ('2024-01-15T09:00:00Z', 'robot-1', 12.5, 8.3, 0.5, 48000, 's3://warehouse/scan_001.laz'),
  ('2024-01-15T09:00:05Z', 'robot-1', 15.2, 10.1, 0.5, 52000, 's3://warehouse/scan_002.laz'),
  ('2024-01-15T09:00:10Z', 'robot-1', 18.7, 12.8, 0.5, 45000, 's3://warehouse/scan_003.laz'),
  ('2024-01-15T09:00:15Z', 'robot-1', 45.3, 30.2, 0.5, 51000, 's3://warehouse/scan_004.laz'),
  ('2024-01-15T09:00:20Z', 'robot-1', 48.9, 32.5, 0.5, 49000, 's3://warehouse/scan_005.laz');
```

```questdb-sql title="Find scans within a rectangular region"
SELECT ts, robot_id, pose_x, pose_y, scan
FROM lidar_scans
WHERE within_box(pose_x, pose_y, 10.0, 5.0, 20.0, 15.0);
```

| ts                          | robot_id | pose_x | pose_y | scan                        |
| :-------------------------- | :------- | :----- | :----- | :-------------------------- |
| 2024-01-15T09:00:00.000000Z | robot-1  | 12.5   | 8.3    | s3://warehouse/scan_001.laz |
| 2024-01-15T09:00:05.000000Z | robot-1  | 15.2   | 10.1   | s3://warehouse/scan_002.laz |
| 2024-01-15T09:00:10.000000Z | robot-1  | 18.7   | 12.8   | s3://warehouse/scan_003.laz |

```questdb-sql title="Lookup scans by zone name"
CREATE TABLE zones (
  zone_name SYMBOL,
  min_x DOUBLE,
  min_y DOUBLE,
  max_x DOUBLE,
  max_y DOUBLE
);

INSERT INTO zones VALUES
  ('loading_dock', 0, 0, 25, 20),
  ('storage_area', 40, 25, 60, 45);

SELECT s.ts, s.robot_id, s.scan
FROM lidar_scans s
JOIN zones z ON within_box(s.pose_x, s.pose_y, z.min_x, z.min_y, z.max_x, z.max_y)
WHERE z.zone_name = 'loading_dock';
```

| ts                          | robot_id | scan                        |
| :-------------------------- | :------- | :-------------------------- |
| 2024-01-15T09:00:00.000000Z | robot-1  | s3://warehouse/scan_001.laz |
| 2024-01-15T09:00:05.000000Z | robot-1  | s3://warehouse/scan_002.laz |
| 2024-01-15T09:00:10.000000Z | robot-1  | s3://warehouse/scan_003.laz |

### within_radius

`within_radius(x, y, center_x, center_y, radius)` - Returns `true` if a
point lies within a specified Euclidean distance from a center point
(inclusive).

Use this function for circular area queries in local coordinate systems.

**Arguments:**

- `x` - X coordinate of the point to test (double)
- `y` - Y coordinate of the point to test (double)
- `center_x` - X coordinate of the circle center (double)
- `center_y` - Y coordinate of the circle center (double)
- `radius` - Radius of the circle in the same units as coordinates (double).
  Must be non-negative.

**Return value:**

Returns `boolean`:

- `true` if the point is inside or exactly on the circle boundary
- `false` if the point is outside the circle
- `NULL` if any argument is `NULL`

Invalid inputs (such as `NaN` or negative radius) produce an error.

**Examples:**

```questdb-sql title="Find scans within 10 meters of a point of interest"
SELECT ts, robot_id, pose_x, pose_y, scan
FROM lidar_scans
WHERE within_radius(pose_x, pose_y, 15.0, 10.0, 10.0);
```

| ts                          | robot_id | pose_x | pose_y | scan                        |
| :-------------------------- | :------- | :----- | :----- | :-------------------------- |
| 2024-01-15T09:00:00.000000Z | robot-1  | 12.5   | 8.3    | s3://warehouse/scan_001.laz |
| 2024-01-15T09:00:05.000000Z | robot-1  | 15.2   | 10.1   | s3://warehouse/scan_002.laz |
| 2024-01-15T09:00:10.000000Z | robot-1  | 18.7   | 12.8   | s3://warehouse/scan_003.laz |

```questdb-sql title="Lookup scans by zone name (circular regions)"
CREATE TABLE zones_circular (
  zone_name SYMBOL,
  center_x DOUBLE,
  center_y DOUBLE,
  radius DOUBLE
);

INSERT INTO zones_circular VALUES
  ('workstation_A', 15.0, 10.0, 8.0),
  ('workstation_B', 47.0, 31.0, 5.0);

SELECT s.ts, s.robot_id, s.scan
FROM lidar_scans s
JOIN zones_circular z ON within_radius(s.pose_x, s.pose_y, z.center_x, z.center_y, z.radius)
WHERE z.zone_name = 'workstation_A';
```

| ts                          | robot_id | scan                        |
| :-------------------------- | :------- | :-------------------------- |
| 2024-01-15T09:00:00.000000Z | robot-1  | s3://warehouse/scan_001.laz |
| 2024-01-15T09:00:05.000000Z | robot-1  | s3://warehouse/scan_002.laz |

## Geographic coordinate functions

These functions work with latitude/longitude coordinates and return results in
real-world units (meters). They use equirectangular projection for fast
approximate calculations.

:::note Projection accuracy

Geographic functions use equirectangular projection, which provides good accuracy
for local-area queries (under 100km). Accuracy decreases at extreme latitudes
near the poles. For applications requiring geodetic precision over large
distances, consider using a dedicated GIS library.

:::

The examples below use this table schema for vehicle tracking:

```questdb-sql title="Vehicle positions table"
CREATE TABLE vehicle_positions (
  ts TIMESTAMP,
  vehicle_id SYMBOL,
  lat DOUBLE,
  lon DOUBLE,
  speed DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY;

INSERT INTO vehicle_positions VALUES
  ('2024-01-15T10:00:00Z', 'truck-1', 51.5074, -0.1278, 0),
  ('2024-01-15T10:00:05Z', 'truck-1', 51.5095, -0.1245, 25),
  ('2024-01-15T10:00:10Z', 'truck-1', 51.5120, -0.1190, 30),
  ('2024-01-15T10:00:15Z', 'truck-1', 51.5280, -0.1020, 35),
  ('2024-01-15T10:00:20Z', 'truck-1', 51.5350, -0.0890, 40);
```

### geo_within_radius_latlon

`geo_within_radius_latlon(lat, lon, center_lat, center_lon, radius_meters)` -
Returns `true` if a geographic point lies within a specified distance from a
center point (inclusive).

Use this function for proximity queries on GPS data, location-based filtering,
and geographic area searches.

**Arguments:**

- `lat` - Latitude of the point to test in degrees (-90 to 90)
- `lon` - Longitude of the point to test in degrees (-180 to 180)
- `center_lat` - Latitude of the center point in degrees (-90 to 90)
- `center_lon` - Longitude of the center point in degrees (-180 to 180)
- `radius_meters` - Radius in meters (double). Must be non-negative.

**Return value:**

Returns `boolean`:

- `true` if the point is within the specified distance
- `false` if the point is outside the radius
- `NULL` if any argument is `NULL`

Invalid inputs (coordinates out of range, `NaN`, or negative radius) produce an
error.

**Examples:**

```questdb-sql title="Find vehicle positions within 500m of a depot"
SELECT ts, vehicle_id, lat, lon
FROM vehicle_positions
WHERE geo_within_radius_latlon(lat, lon, 51.5074, -0.1278, 500);
```

| ts                          | vehicle_id | lat     | lon     |
| :-------------------------- | :--------- | :------ | :------ |
| 2024-01-15T10:00:00.000000Z | truck-1    | 51.5074 | -0.1278 |
| 2024-01-15T10:00:05.000000Z | truck-1    | 51.5095 | -0.1245 |
| 2024-01-15T10:00:10.000000Z | truck-1    | 51.5120 | -0.1190 |

```questdb-sql title="Lookup positions by service area name"
CREATE TABLE service_areas (
  area_name SYMBOL,
  center_lat DOUBLE,
  center_lon DOUBLE,
  radius_m DOUBLE
);

INSERT INTO service_areas VALUES
  ('central_london', 51.5074, -0.1278, 1000),
  ('kings_cross', 51.5320, -0.1240, 800);

SELECT v.ts, v.vehicle_id, v.lat, v.lon
FROM vehicle_positions v
JOIN service_areas a ON geo_within_radius_latlon(v.lat, v.lon, a.center_lat, a.center_lon, a.radius_m)
WHERE a.area_name = 'central_london';
```

| ts                          | vehicle_id | lat     | lon     |
| :-------------------------- | :--------- | :------ | :------ |
| 2024-01-15T10:00:00.000000Z | truck-1    | 51.5074 | -0.1278 |
| 2024-01-15T10:00:05.000000Z | truck-1    | 51.5095 | -0.1245 |
| 2024-01-15T10:00:10.000000Z | truck-1    | 51.5120 | -0.1190 |

### geo_distance_meters

`geo_distance_meters(lat1, lon1, lat2, lon2)` - Calculates the distance in
meters between two geographic points.

Use this function to compute distances between GPS coordinates, measure travel
distances, or rank results by proximity.

**Arguments:**

- `lat1` - Latitude of the first point in degrees (-90 to 90)
- `lon1` - Longitude of the first point in degrees (-180 to 180)
- `lat2` - Latitude of the second point in degrees (-90 to 90)
- `lon2` - Longitude of the second point in degrees (-180 to 180)

**Return value:**

Returns `double`:

- Distance in meters between the two points
- `NULL` if any argument is `NULL`

Invalid inputs (coordinates out of range or `NaN`) produce an error.

**Examples:**

```questdb-sql title="Calculate distance from depot for each position"
SELECT
    ts,
    vehicle_id,
    round(geo_distance_meters(lat, lon, 51.5074, -0.1278), 0) AS distance_from_depot_m
FROM vehicle_positions;
```

| ts                          | vehicle_id | distance_from_depot_m |
| :-------------------------- | :--------- | :-------------------- |
| 2024-01-15T10:00:00.000000Z | truck-1    | 0                     |
| 2024-01-15T10:00:05.000000Z | truck-1    | 312                   |
| 2024-01-15T10:00:10.000000Z | truck-1    | 768                   |
| 2024-01-15T10:00:15.000000Z | truck-1    | 2876                  |
| 2024-01-15T10:00:20.000000Z | truck-1    | 4123                  |

```questdb-sql title="Calculate distance to a specific depot"
CREATE TABLE depots (
  depot_name SYMBOL,
  lat DOUBLE,
  lon DOUBLE
);

INSERT INTO depots VALUES
  ('west_depot', 51.5074, -0.1278),
  ('east_depot', 51.5300, -0.0700);

SELECT
    v.ts,
    v.vehicle_id,
    round(geo_distance_meters(v.lat, v.lon, d.lat, d.lon), 0) AS distance_m
FROM vehicle_positions v
JOIN depots d ON d.depot_name = 'east_depot';
```

| ts                          | vehicle_id | distance_m |
| :-------------------------- | :--------- | :--------- |
| 2024-01-15T10:00:00.000000Z | truck-1    | 4823       |
| 2024-01-15T10:00:05.000000Z | truck-1    | 4511       |
| 2024-01-15T10:00:10.000000Z | truck-1    | 4055       |
| 2024-01-15T10:00:15.000000Z | truck-1    | 1567       |
| 2024-01-15T10:00:20.000000Z | truck-1    | 1456       |

## Geohash functions

Geohash functions encode geographic coordinates into compact string
representations suitable for indexing. For comprehensive geohash documentation,
see the [geohashes data type](/docs/query/datatypes/geohashes/) and
[spatial operators](/docs/query/operators/spatial/).

### rnd_geohash

`rnd_geohash(bits)` - Returns a random geohash of variable precision.

**Arguments:**

- `bits` - An integer between `1` and `60` which determines the precision of the
  generated geohash

**Return value:**

Returns a `geohash`.

**Examples:**

```questdb-sql title="Generate random geohashes of various precisions"
SELECT
    rnd_geohash(7) AS g7,
    rnd_geohash(10) AS g10,
    rnd_geohash(30) AS g30,
    rnd_geohash(60) AS g60
FROM long_sequence(3);
```

| g7      | g10 | g30    | g60          |
| :------ | :-- | :----- | :----------- |
| 1101100 | 4h  | hsmmq8 | rjtwedd0z72p |
| 0010011 | vf  | f9jc1q | fzj09w97tj1h |
| 0101011 | kx  | fkhked | v4cs8qsnjkeh |

### make_geohash

`make_geohash(lon, lat, bits)` - Converts latitude and longitude coordinates
into a geohash.

For use within Java embedded scenarios, see the
[Java embedded documentation for geohashes](/docs/query/datatypes/geohashes/#java-embedded-usage).

**Arguments:**

- `lon` - Longitude coordinate as a floating point value (-180 to 180)
- `lat` - Latitude coordinate as a floating point value (-90 to 90)
- `bits` - An integer between `1` and `60` which determines the precision of the
  generated geohash

The latitude and longitude arguments may be constants, column values, or the
results of functions.

**Return value:**

Returns a `geohash`:

- If latitude/longitude constants are invalid, an error is thrown at compile
  time
- If column values have invalid coordinates, returns `NULL`

**Examples:**

```questdb-sql title="Convert coordinates to geohash"
SELECT make_geohash(142.89124148, -12.90604153, 40);
```

| make_geohash |
| :----------- |
| qn2v7wnkhq   |

```questdb-sql title="Create geohash column from coordinate columns"
SELECT
    location_name,
    make_geohash(lon, lat, 30) AS geohash
FROM locations;
```

## See also

- [Geohashes data type](/docs/query/datatypes/geohashes/) - Detailed geohash
  documentation
- [Spatial operators](/docs/query/operators/spatial/) - The `within` operator
  for geohash prefix matching
