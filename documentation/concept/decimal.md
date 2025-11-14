---
title: Decimal
description:
  This document describes how to work with the decimal data type in QuestDB,
  including precision and scale, literal syntax, arithmetic operations, and best
  practices for financial and scientific calculations.
---

QuestDB provides a `decimal` data type for exact numeric calculations, useful
for financial computations, scientific measurements, and any scenario where
precision matters. This page explains how to use decimals effectively, including
syntax, operations, and performance considerations.

## What are decimals?

Decimals are fixed-point numbers that maintain exact precision during arithmetic
operations. Unlike floating-point types (`float` and `double`), decimals avoid
rounding errors by storing numbers as scaled integers internally. This makes
them ideal for monetary calculations where accuracy is critical.

## Decimal type in QuestDB

QuestDB implements decimals with the syntax `DECIMAL(precision, scale)`:

- **Precision**: Total number of significant digits (1-76)
- **Scale**: Number of digits after the decimal point (0-precision)

For example, `DECIMAL(10, 2)` can store values from -99,999,999.99 to
99,999,999.99.

If neither the precision and scale are provided, the type defaults to a
precision of 18 and a scale of 3.

### Storage

QuestDB automatically selects the optimal storage size based on the decimal's
precision:

| Precision    | Storage Size | Internal Type |
| ------------ | ------------ | ------------- |
| 1-2 digits   | 1 byte       | DECIMAL8      |
| 3-4 digits   | 2 bytes      | DECIMAL16     |
| 5-9 digits   | 4 bytes      | DECIMAL32     |
| 10-18 digits | 8 bytes      | DECIMAL64     |
| 19-38 digits | 16 bytes     | DECIMAL128    |
| 39-76 digits | 32 bytes     | DECIMAL256    |

## Decimal literals

QuestDB requires the `m` suffix to distinguish decimal literals from
floating-point numbers:

```questdb-sql
-- Decimal literals use the 'm' suffix
SELECT 123.45m;        -- Decimal value 123.45
SELECT 0.001m;         -- Decimal value 0.001
SELECT 1000000.00m;    -- Decimal value 1,000,000.00

-- Without 'm' suffix, numbers are treated as double
SELECT 123.45;         -- Double value (floating-point)
```

:::important

Always use the `m` suffix for decimal literals. QuestDB does not implicitly
convert doubles to decimals to prevent unintended precision loss.

:::

## Creating tables with decimals

Define decimal columns by specifying precision and scale:

```questdb-sql
CREATE TABLE eth_fills (
    fill_id LONG,
    venue SYMBOL,
    fill_size_eth DECIMAL(28, 18),   -- ETH quantity with wei-level precision
    fill_price_usdc DECIMAL(14, 2),  -- Execution price per ETH in USDC
    fee_rate DECIMAL(6, 5),          -- Exchange fee rate (e.g., 0.00050 = 5 bps)
    gas_fee_eth DECIMAL(20, 18),     -- Gas paid in ETH
    timestamp TIMESTAMP
) timestamp(timestamp) partition by day;
```

## Working with decimals

### Basic arithmetic

Decimal arithmetic maintains precision automatically:

```questdb-sql
-- Insert ETH fill data
INSERT INTO eth_fills VALUES
    (1, 'spot:coinbase', 0.842345678901234567m, 2123.45m, 0.00040m, 0.002300000000000000m, now()),
    (2, 'perp:binance', 5.250000000000000000m, 2118.10m, 0.00020m, 0.001200000000000000m, now()),
    (3, 'defi:uniswap', 18.750000000000000000m, 2115.05m, 0.00065m, 0.004500000000000000m, now());

-- Arithmetic operations maintain precision
SELECT
    venue,
    fill_size_eth,
    fill_price_usdc,
    fill_size_eth * fill_price_usdc AS notional_usdc,
    fill_size_eth * fill_price_usdc * fee_rate AS fee_usdc,
    gas_fee_eth * fill_price_usdc AS gas_cost_usdc,
    fill_size_eth - gas_fee_eth AS net_eth_after_gas,
    fill_size_eth * fill_price_usdc
        - fill_size_eth * fill_price_usdc * fee_rate
        - gas_fee_eth * fill_price_usdc AS net_settlement_usdc
FROM eth_fills;
```

### Precision and scale in operations

QuestDB automatically determines the result precision and scale for decimal
operations based on the operands:

#### Addition and subtraction

- **Scale**: Maximum scale of the operands
- **Precision**: Maximum precision of the operands (scaled) + 1

```questdb-sql
-- Addition with different scales
SELECT 10.5m + 1.234m;  -- scale: max(1, 3) = 3, Result: 11.734

-- Adding DECIMAL(10,2) + DECIMAL(8,2) → DECIMAL(11,2)
SELECT 99999999.99m + 999999.99m;  -- Result has precision 11, scale 2
```

The additional precision digit allows the result to accommodate potential
overflow (e.g., 99.9 + 99.9 = 199.8 requires 4 digits instead of 3).

#### Multiplication

- **Scale**: Sum of the scales of both operands
- **Precision**: Sum of the precision of both operands

```questdb-sql
-- Multiplication adds scales
SELECT 10.50m * 1.25m;  -- scale: 2 + 2 = 4, Result: 13.1250

-- DECIMAL(5,2) * DECIMAL(4,2) → DECIMAL(9,4)
SELECT 100.50m * 12.34m;  -- Result: 1240.1700
```

#### Division

- **Scale**: Maximum scale of the operands

```questdb-sql
-- Division uses maximum scale
SELECT 10.50m / 2.0m;  -- scale: max(2, 1) = 2, Result: 5.25

-- Division may truncate beyond the scale
SELECT 10.00m / 3.00m;  -- Result: 3.33 (limited to scale 2)
```

### Comparison operations

Decimals support all standard comparison operators:

```questdb-sql
-- Find whale-sized ETH fills (>= 10 ETH)
SELECT * FROM eth_fills WHERE fill_size_eth >= 10.000000000000000000m;

-- Find attractive fee tiers
SELECT * FROM eth_fills WHERE fee_rate <= 0.00025m;

-- Range queries on ETH price
SELECT * FROM eth_fills WHERE fill_price_usdc BETWEEN 2100.00m AND 2200.00m;
```

## Type casting

### Explicit casting

Convert between numeric types using `CAST`:

```questdb-sql
-- From integer to decimal
SELECT CAST(100 AS DECIMAL(10, 2));  -- Result: 100.00

-- From double to decimal (use with caution - may lose precision)
SELECT CAST(123.456789 AS DECIMAL(8, 3));  -- Result: 123.457

-- From decimal to other types
SELECT CAST(99.99m AS INT);    -- Result: 99 (truncate)
SELECT CAST(99.99m AS DOUBLE);  -- Result: 99.99 (as floating-point)
```

### Important casting rules

- **No implicit conversion from double/float**: Must use explicit `CAST` or
  decimal literals
- **Integer to decimal**: Safe, no precision loss, the decimals have a scale of
  0
- **Double to decimal**: May lose precision due to floating-point representation
- **Between decimal types**: Automatic when precision/scale allows

## Considerations

### Advantages

- **Exact results**: Perfect for financial calculations and accounting
- **Predictable behavior**: No surprising rounding errors
- **Regulatory compliance**: Meets requirements for exact monetary calculations

### Trade-offs

- **Slower than floating-point**: Typically slower than `double` operations
- **More storage**: May use more space than `float` for equivalent range
- **Complex operations**: Division have overhead

### Performance tips

- **Use appropriate precision**: Don't over-specify precision beyond your needs
- **Keep precision ≤ 18 when possible**: DECIMAL64 operations are faster than
  DECIMAL128/256

## Common use cases

### Financial calculations

```questdb-sql
-- Portfolio valuation with exact arithmetic
CREATE TABLE portfolio (
    symbol SYMBOL,
    position_size DECIMAL(12, 4),     -- Fractional position sizes (shares, BTC, etc.) supported
    price DECIMAL(10, 2),       -- Stock price
    commission DECIMAL(7, 2),   -- Trading fees
    timestamp TIMESTAMP
) timestamp(timestamp);

-- Calculate exact portfolio value
SELECT
    symbol,
    position_size,
    price,
    position_size * price AS position_value,
    position_size * price - commission AS net_value,
    sum(position_size * price) OVER () AS total_portfolio_value
FROM portfolio
WHERE timestamp = now();
```

### Cryptocurrency trading

```questdb-sql
-- ETH trading with high precision (18 decimals like wei)
CREATE TABLE crypto_trades (
    trade_id LONG,
    pair SYMBOL,
    eth_amount DECIMAL(28, 18),      -- ETH with full wei precision
    usdt_price DECIMAL(12, 2),        -- USDT price per ETH
    fee_rate DECIMAL(5, 4),           -- Trading fee (e.g., 0.001 for 0.1%)
    gas_fee_eth DECIMAL(18, 18),      -- Gas fee in ETH
    timestamp TIMESTAMP
) timestamp(timestamp);

-- Calculate trade values with exact precision
SELECT
    trade_id,
    eth_amount,
    usdt_price,
    eth_amount * usdt_price AS trade_value_usdt,
    eth_amount * usdt_price * fee_rate AS fee_usdt,
    eth_amount * usdt_price * (1.0m - fee_rate) AS net_value_usdt,
    eth_amount - gas_fee_eth AS net_eth_received
FROM crypto_trades;
```

### Scientific measurements

```questdb-sql
-- High-precision sensor data
CREATE TABLE sensor_readings (
    sensor_id SYMBOL,
    measurement DECIMAL(20, 10),  -- 10 decimal places of precision
    calibration_factor DECIMAL(6, 5),
    timestamp TIMESTAMP
) timestamp(timestamp);

-- Apply calibration with exact arithmetic
SELECT
    sensor_id,
    measurement,
    measurement * calibration_factor AS calibrated_value,
    avg(measurement) OVER (PARTITION BY sensor_id) AS avg_reading
FROM sensor_readings
SAMPLE BY 1h;
```

## Best practices

### When to use decimals

**Use decimals for:**

- Financial data (prices, amounts, exchange rates)
- Crypto trading data (fractional position sizes, token balances, fees)
- Accounting calculations
- Scientific measurements requiring exact precision
- Regulatory compliance scenarios
- Any calculation where rounding errors are unacceptable

**Avoid decimals for:**

- Scientific calculations requiring extensive math functions
- Performance-critical analytics on large datasets
- Approximate values where precision isn't critical
- Coordinates or measurements where float precision suffices

### Design guidelines

1. **Choose appropriate precision and scale**

   ```questdb-sql
   -- Good: Matches business requirements
   CREATE TABLE prices (
       amount DECIMAL(10, 2)  -- Cents precision for USD
   );

   -- Avoid: Excessive precision
   CREATE TABLE prices (
       amount DECIMAL(30, 15)  -- Unnecessary for most use cases
   );
   ```

2. **Use the 'm' suffix consistently**

   ```questdb-sql
   -- Good: Clear decimal literals
   INSERT INTO prices VALUES (99.99m);

   -- Error: Missing 'm' suffix
   INSERT INTO prices VALUES (99.99);  -- Treated as double, will fail
   ```

3. **Explicit casting when mixing types**

   ```questdb-sql
   -- Good: Explicit cast
   SELECT amount + CAST(10 AS DECIMAL(10, 2)) FROM prices;

   -- Good: Use decimal literal
   SELECT amount + 10.00m FROM prices;
   ```
