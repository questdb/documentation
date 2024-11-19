---
title: Operator Precedence Table
sidebar_label: Precedence Table
description: Operator precedence table
---

The following tables provide information about which operators are available, and their corresponding precedences.

For IPv4 operators, this list is not comprehensive, and users should refer directly to the [IPv4](/docs/reference/operators/ipv4/) documentation itself.

## Pre-8.0 notice

In QuestDB 8.0.0, operator precedence is aligned closer to other SQL implementations.

If upgrading from 8.0, review your queries for any relevant changes.

If you are unable to migrate straight away, set the `cairo.sql.legacy.operator.precedence` config option to `true` in `server.conf`.

This is a temporary flag which will be removed in succeeding versions of QuestDB.

Legacy precedence, if set, is:

1. `.`, `::`
2. (none)
3. `*`, `/`, `%`, `+`, `-`
4. `<<`, `>>`, `<<=`, `>>=`
5. `||`
6. `<`, `>`, `<=`, `>=
7. `=`, `~`, `!=`, `<>`, `!~`, `IN`, `BETWEEN`, `LIKE`, `ILIKE`, `WITHIN`
8. `&`
9. `^`
10. `|`
11. `AND`, `OR`, `NOT`

See the next section for the current precedence.

### Current

| operator                                                 | name                         | precedence | description                       |
|----------------------------------------------------------|------------------------------|------------|-----------------------------------|
| [`.`](misc.md#-prefix)                                   | prefix                       | 1          | prefix field with table name      |
| [`::`](misc.md#-cast)                                    | cast                         | 2          | postgres style type casting       |
| [`-`](numeric.md#--negate)                               | negate                       | 3          | unary negation of a number        |
| [`~`](bitwise.md#-not)                                   | complement                   | 3          | unary complement of a number      |
| [`*`](numeric.md#-multiply)                              | multiply                     | 4          | multiply two numbers              |
| [`/`](numeric.md#-divide)                                | divide                       | 4          | divide two numbers                |
| [`%`](numeric.md#-modulo)                                | modulo                       | 4          | take the modulo of two numbers    |
| [`+`](numeric.md#-add)                                   | add                          | 5          | add two numbers                   |
| [`-`](numeric.md#--subtract)                             | subtract                     | 5          | subtract two numbers              |
| [`<<`](ipv4.md#-left-strict-ip-address-contained-by)     | left IPv4 contains strict    | 6          |                                   |
| [`>>`](ipv4.md#-right-strict-ip-address-contained-by)    | right IPv4 contains strict   | 6          |                                   |
| [`<<=`](ipv4.md#-left-ip-address-contained-by-or-equal)  | left IPv4 contains or equal  | 6          |                                   |
| [`<<=`](ipv4.md#-right-ip-address-contained-by-or-equal) | right IPv4 contains or equal | 6          |                                   |
| [`\|\|`](text.md#-concat)                                | concat                       | 7          | concatenate strings               |
| [`&`](bitwise.md#-and)                                   | bitwise and                  | 8          | bitwise AND of two numbers        |
| [`^`](bitwise.md#-xor)                                   | bitwise xor                  | 9          | bitwise XOR of two numbers        |
| [`\|`](bitwise.md#-or)                                   | bitwise or                   | 10         | bitwise OR of two numbers         |
| [`IN`](date-time.md#in)                                  | in                           | 11         | check if value in list or range   |
| [`BETWEEN`](date-time.md#between)                        | between                      | 11         | check if timestamp in range       |
| [`WITHIN`](spatial.md#within)                            | within geohash               | 11         | prefix matches geohash            |
| [`<`](comparison.md#-lesser-than)                        | lesser than                  | 12         | lt comparison                     |
| [`<=`](comparison.md#-lesser-than-or-equal-to)           | lesser than or equal to      | 12         | leq comparison                    |
| [`>`](comparison.md#-greater-than)                       | greater than                 | 12         | gt comparison                     |
| [`>=`](comparison.md#-greater-than-or-equal-to)          | greater than or equal to     | 12         | geq comparison                    |
| [`=`](comparison.md#-equals)                             | equals                       | 13         | eq comparison                     |
| [`~`](text.md#-regex-match)                              | regex match                  | 13         | regex pattern match               |
| [`!=`](comparison.md#-or--not-equals)                    | not equals                   | 13         | neq comparison                    |
| [`<>`](comparison.md#-or--not-equals)                    | not equals                   | 13         | neq comparison                    |
| [`!~`](text.md#-regex-doesnt-match)                      | regex does not match         | 13         | regex pattern does not match      |
| [`LIKE`](text.md#like)                                   | match string                 | 13         | pattern matching                  |
| [`ILIKE`](text.md#ilike)                                 | match string without case    | 13         | case insensitive pattern matching |
| [`NOT`](logical.md#not)                                  | logical not                  | 14         | logical NOT of two numbers        |
| [`AND`](logical.md#and)                                  | logical and                  | 15         | logical AND of two numbers        |
| [`OR`](logical.md#or)                                    | logical or                   | 16         | logical OR of two numbers         |
