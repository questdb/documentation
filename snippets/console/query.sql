weather -- 10 years of weather data in NYC with 10-minute resolution

SELECT avg(trip_distance) FROM trips;

SELECT passenger_count, avg(fare_amount)
    FROM trips
    ORDER BY passenger_count;

SELECT trip_type, avg(trip_distance)
    FROM trips
    WHERE pickup_datetime IN '2018-06;2w';

SELECT pickup_datetime, cab_type, trip_type, tempF, skyCover, windSpeed
    FROM trips
    ASOF JOIN weather
    WHERE pickup_datetime IN '2018-03-25';
