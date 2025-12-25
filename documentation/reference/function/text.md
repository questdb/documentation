---
title: Text functions
sidebar_label: Text
description: Text function reference documentation.
---

This page describes the available functions to assist with performing text
manipulation such as concatenation, case conversion, and string length
calculation.

:::note VARCHAR and STRING data types

QuestDB supports two types of string data: `VARCHAR` and `STRING`. Most users
should use `VARCHAR` as it is more efficient. See
[VARCHAR vs STRING](/docs/reference/sql/datatypes#varchar-and-string-considerations)
for more information.

Functions described in this page work with both types.

:::

## concat

`concat(str, ...)` - concatenates a string from one or more input values.

```questdb-sql title="Example"
SELECT firstName, lastName, concat(firstName, ' ', lastName) FROM names;
```

| firstName | lastName | concat        |
| --------- | -------- | ------------- |
| Tim       | Thompson | Tim Thompson  |
| Anna      | Thompson | Anna Thompson |
| Anna      | Mason    | Anna Mason    |
| Tom       | Johnson  | Tom Johnson   |
| Tim       | Smith    | Tim Smith     |

:::tip

`concat()` can be used to generate `line protocol`. See an example below.

:::

```questdb-sql title="Generating line protocol"
SELECT
concat(
    'trades,instrument=', rnd_str(2,2,0),
    ',side=', rnd_str('B', 'S'),
    ' price=', abs(cast(rnd_double(0)*100000 AS INT)),
    ',quantity=', abs(cast(rnd_double(0)*10000 AS INT)),
    ' ',
    1571270400000 + (x-1) * 100
)
FROM long_sequence(5) x;
```

```title="Result"
trades,instrument=CR,side=B price=70867,quantity=9192 1571270400000
trades,instrument=LN,side=S price=37950,quantity=1439 1571270400100
trades,instrument=ZJ,side=S price=82829,quantity=8871 1571270400200
trades,instrument=EW,side=S price=10427,quantity=1945 1571270400300
trades,instrument=MI,side=B price=99348,quantity=8450 1571270400400
```

## length

`length(string)` - reads length of `string` value type (result is `int`)

`length(symbol)` - reads length of `symbol` value type (result is `int`)

`length(blob)` - reads length of `binary` value type (result is `long`)

- a `string`
- a `symbol`
- a `binary` blob

```questdb-sql title="Example"
SELECT name a, length(name) b FROM names limit 4
```

| a      | b   |
| ------ | --- |
| AARON  | 5   |
| AMELIE | 6   |
| TOM    | 3   |
| null   | -1  |

## left

`left(string, count)` - extracts a substring of the given length from a string
(starting from left).

**Arguments:**

- `string` is a string to extract from.
- `count` is an integer specifying the count of characters to be extracted into
  a substring.

**Return value:**

Returns a string with the extracted characters.

**Examples:**

```questdb-sql title="Example"
SELECT name, left('Thompson', 3) l FROM names LIMIT 3
```

| name   | l   |
| ------ | --- |
| AARON  | AAR |
| AMELIE | AME |
| TOM    | TOM |

## right

`right(string, count)` - extracts a substring of the given length from a string
(starting from right).

**Arguments:**

- `string` is a string to extract from.
- `count` is an integer specifying the count of characters to be extracted into
  a substring.

**Return value:**

Returns a string with the extracted characters.

**Examples:**

```questdb-sql title="Example"
SELECT name, right('Thompson', 2) r FROM names LIMIT 3
```

| name   | l   |
| ------ | --- |
| AARON  | ON  |
| AMELIE | IE  |
| TOM    | OM  |

## replace

`replace` replaces all occurrences of a substring within a string with another
substring.

**Arguments:**

- `replace(string, from_string, to_string)`

  - `string` is the original string where replacements will be made.
  - `from_string` is the substring that will be searched for in the original
    string.
  - `to_string` is the substring that will replace occurrences of `from_string`.

**Return value:**

Returns a new string that is derived from the original string by replacing every
occurrence of `from_string` with `to_string`.

**Examples:**

```sql
SELECT replace('Hello World', 'World', 'QuestDB');
```

| replace       |
| ------------- |
| Hello QuestDB |

## lpad

**Arguments:**

- `lpad(string, length, fill)`

  - `string` is the input string that you want to pad.
  - `length` is the length of the resulting string after padding. If this is
    less than the length of the original string, the original string is
    truncated to the specified length.
  - `fill` is the string to use for padding. If this is not specified, spaces
    are used.

**Return value:**

Returns a string that is padded on the left with the specified fill string to
the specified length.

**Example:**

```questdb-sql title="Using lpad function"
SELECT lpad('QuestDB', 10, '0') AS padded_string;
```

| lpad       |
| ---------- |
| 000QuestDB |

## ltrim

**Arguments:**

- `ltrim(string)`

  - `string` is the input string from which you want to remove leading
    whitespace.

**Return value:**

Returns a string with leading whitespace removed.

**Example:**

```questdb-sql title="Using ltrim function"
SELECT ltrim('   QuestDB   ') AS trimmed_string;
```

| trim                            |
| ------------------------------- |
| QuestDB&nbsp;&nbsp;&nbsp;&nbsp; |

## rtrim

`rtrim` extracts white space from the right of a string value.

**Arguments:**

- `rtrim(string)`

**Return value:**

Returns a new string derived from the original string, minus all trailing
occurrences of white space.

**Examples:**

```sql
SELECT rtrim('Hello QuestDB   ');
```

| rtrim         |
| ------------- |
| Hello QuestDB |

## trim

**Arguments:**

- `trim(string)`

  - `string` is the input string from which you want to remove leading and
    trailing whitespace.

**Return value:**

Returns a string with leading and trailing whitespace removed.

**Example:**

```questdb-sql title="Using trim function"
SELECT trim('   QuestDB   ') AS trimmed_string;
```

| trim    |
| ------- |
| QuestDB |

## split_part

**Arguments:**

- `split_part(string, delimiter, part)`

  - `string` is the original string that will be split.
  - `delimiter` is the character or characters that will be used to split the
    string.
  - `part` is an integer that specifies which part to return, starting from 1.

**Return value:**

Returns the part at the specified position from the string that has been split
by the delimiter.

**Examples:**

```sql
SELECT split_part('Hello,QuestDB,SQL', ',', 2);
```

| split_part |
| ---------- |
| QuestDB    |

## starts_with

**Arguments:**

- `starts_with(string, substring)`

  - `string` is the original string that will be checked.
  - `substring` is the substring that will be checked if it's at the start of
    the original string.

**Return value:**

Returns `true` if the original string starts with the specified substring,
`false` otherwise.

**Examples:**

```sql
SELECT starts_with('Hello QuestDB', 'Hello');
```

| starts_with |
| ----------- |
| true        |

## string_agg

**Arguments:**

- `string_agg(expression, delimiter)`

  - `expression` is the string that will be aggregated.
  - `delimiter` is the string that will be inserted between the values in the
    result string.

**Return value:**

Returns a string that is the result of concatenating all the string values in a
group, separated by the specified delimiter.

**Examples:**

```questdb-sql
SELECT string_agg(symbol, ',') as symbols
FROM trades;
```

| makes                                                       |
| ----------------------------------------------------------- |
| Honeywell,Honeywell,United Automation,United Automation,... |

It's common to append a `LIMIT` so that, such as in this case, the values
repeat:

```questdb-sql
SELECT string_agg(symbol, ',') as symbols
FROM (
  SELECT symbol
  FROM trades
  LIMIT 10
) sub;
```

This will return 10 concatenated strings.

## strpos / position

`strpos(string, substring)` or `position(string, substring)` - searches for the
first substring occurrence in a string, and returns the index position of the
starting character. If the substring is not found, this function returns `0`.
The performed search is case-sensitive.

**Arguments:**

- `string` is a string to search in.
- `substring` is a string to search for.

**Return value:**

Returns an integer for the substring position. Positions start from `1`.

**Examples:**

```questdb-sql title="Example"
SELECT name, strpos(name, 'Thompson') idx
FROM full_names
LIMIT 4;

-- This is equal to:
SELECT name, position(name, 'Thompson') idx
FROM full_names
LIMIT 4;
```

| name          | idx |
| ------------- | --- |
| Tim Thompson  | 5   |
| Anna Thompson | 6   |
| Anna Mason    | 0   |
| Tom Johnson   | 0   |

Assuming we have a table `example_table` with a single string type column `col`:

| col        |
| ---------- |
| apple,pear |
| cat,dog    |
| ...        |

As a more advanced example, we can use `strpos()` or `position()` to split the
string values of `col`, in this case splitting at the comma character, `,` . By
using `left()`/`right()` functions, we can choose the string values at the left
and right of the comma:

```questdb-sql title="Splitting string into two separate columns"
SELECT col,
       left(col, strpos(col, ',') - 1) as col1,
       right(col, length(col) - strpos(col, ',')) as col2
FROM example_table;

-- This is equal to:

SELECT col,
       left(col, position(col, ',') - 1) as col1,
       right(col, length(col) - position(col, ',')) as col2
FROM example_table;
```

| col        | col1  | col2 |
| ---------- | ----- | ---- |
| apple,pear | apple | pear |
| cat,dog    | cat   | dog  |

## substring

`substring(string, start, length)` - extracts a substring from the given string.

**Arguments:**

- `string` is a string to extract from.
- `start` is an integer specifying the position of the first character to be
  extracted. Positions start from `1`.
- `length` is an integer specifying the count of characters to be extracted.
  Should be non-negative.

**Return value:**

Returns a string with the extracted characters. If any part the arguments is
`null`, the function returns `null`.

**Examples:**

```questdb-sql title="Example"
SELECT id, substring(id, 1, 2) country FROM orders LIMIT 3
```

| id              | country |
| --------------- | ------- |
| UK2022072619373 | UK      |
| UK2022072703162 | UK      |
| US2022072676246 | US      |

If the `start` argument is negative, the output depends on the value of
`start+length`:

- If `start+length` is greater than 1, the substring stops at position
  `start+length - 1`.
- If `start+length` is zero, the output is empty string.
- If `start+length` is less than zero, the output is `null`.

```questdb-sql title="Example"
SELECT substring('Lorem ipsum dolor sit amet', -5, 9)
```

| substring |
| --------- |
| Lor       |

## to_lowercase / lower

- `to_lowercase(string)` or `lower(string)` - converts all upper case string
  characters to lowercase

**Arguments**:

`string` is the input strong to be converted.

**Return value**:

Return value type is `string`.

**Examples**:

```questdb-sql
SELECT lower('questDB');
-- This is equal to:
SELECT to_lowercase('questDB');
```

| to_lowercase |
| ------------ |
| questdb      |

## to_uppercase / upper

- `to_uppercase(string)` or `upper(string)` - converts all lower case string
  characters to uppercase

**Arguments**:

`string` is the input strong to be converted.

**Return value**:

Return value type is `string`.

**Examples**:

```questdb-sql
SELECT upper('questDB');
-- This is equal to:
SELECT to_uppercase('questDB');
```

| to_uppercase |
| ------------ |
| QUESTDB      |

## quote_ident

**Arguments:**

- `quote_ident(string)`
  - `string` is the string that may need quoting to be used as a SQL identifier.

**Return value:**

Returns the value enclosed in quotes if needed to make it a valid SQL
identifier, else the value unchanged.

**Examples:**

```sql
SELECT quote_ident("a b");
```

| quote_ident |
| ----------- |
| "a b"       |

```sql
SELECT quote_ident("ab");
```

| quote_ident |
| ----------- |
| ab          |
