---
title: Pattern matching operators
sidebar_label: Pattern matching
description: Pattern matching operators reference documentation.
---

This page describes the available operators to assist with performing pattern
matching. For operators using regular expressions (`regex` in the syntax), QuestDB uses
[Java regular expression implementation](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/regex/Pattern.html).

## ~ (match) and !~ (does not match)

- `(string) ~ (regex)` - returns true if the `string` value matches a regular expression, `regex`, otherwise returns false (case sensitive match).
- `(string) !~ (regex)` - returns true if the `string` value fails to match a regular expression, `regex`, otherwise returns false (case sensitive match).

### Arguments

- `string` is an expression that evaluates to the `string` data type.
- `regex` is any regular expression pattern.

### Return value

Return value type is `boolean`.

## LIKE/ILIKE

- `(string) LIKE (pattern)` - returns true if the `string` value matches `pattern`, otherwise returns false (case sensitive match).
- `(string) ILIKE (pattern)` - returns true if the `string` value matches `pattern`, otherwise returns false (case insensitive match).

### Arguments

- `string` is an expression that evaluates to the `string` data type.
- `pattern` is a pattern which can contain wildcards like `_` and `%`.

### Return value

Return value type is `boolean`.

### Description

If the pattern doesn't contain wildcards, then the pattern represents the string itself.

The wildcards which can be used in pattern are interpreted as follows:
- `_` - matches any single character.
- `%` - matches any sequence of zero or more characters.

Wildcards can be used as follows:

```questdb-sql
SELECT 'quest' LIKE 'quest' ;
-- Returns true
SELECT 'quest' LIKE 'ques_';   
-- Returns true   
SELECT 'quest' LIKE 'que%';
-- Returns true   
SELECT 'quest' LIKE '_ues_';
-- Returns true
SELECT 'quest' LIKE 'q_'
-- Returns false
```


`ILIKE` performs a case insensitive match as follows:

```questdb-sql
SELECT 'quest' ILIKE 'QUEST';
-- Returns true
SELECT 'qUeSt' ILIKE 'QUEST';
-- Returns true
SELECT 'quest' ILIKE 'QUE%';
-- Returns true
SELECT 'QUEST' ILIKE '_ues_';
-- Returns true
```
### Examples

#### LIKE

```questdb-sql 
SELECT * FROM trades
WHERE symbol LIKE '%-USD'
LATEST ON timestamp PARTITION BY symbol;
```

| symbol | side | price | amount | timestamp |
| --- | --- | --- | --- | --- |
| ETH-USD | sell | 1348.13 | 3.22455108 | 2022-10-04T15:25:58.834362Z |
| BTC-USD | sell | 20082.08 | 0.16591219 | 2022-10-04T15:25:59.742552Z |

#### ILIKE

```questdb-sql 
SELECT * FROM trades
WHERE symbol ILIKE '%-usd'
LATEST ON timestamp PARTITION BY symbol;
```

| symbol | side | price | amount | timestamp |
| --- | --- | --- | --- | --- |
| ETH-USD | sell | 1348.13 | 3.22455108 | 2022-10-04T15:25:58.834362Z |
| BTC-USD | sell | 20082.08 | 0.16591219 | 2022-10-04T15:25:59.742552Z |

## regexp_replace

`regexp_replace (string1, regex , string2 )` - provides substitution of new text
for substrings that match regular expression patterns.

### Arguments:

- `string1` is a source `string` value to be manipulated.
- `regex` is a regular expression pattern.
- `string2` is any `string` value to replace part or the whole of the source value.

### Return value

Return value type is `string`. The source string is returned unchanged if there is no match to the pattern. If
there is a match, the source string is returned with the replacement string
substituted for the matching substring.

### Examples:

```questdb-sql title="Example description -  regexp_replace"
SELECT regexp_replace('MYSQL is a great database', '^(\S*)', 'QuestDB');
```

```
QuestDB is a great database
```
