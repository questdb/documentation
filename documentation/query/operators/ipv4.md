---
title: IPv4 Operators
sidebar_label: IPv4
description: IPv4 operators
---

This document outlines the IPv4 data type operators.

The IP addresses can be in the range of `0.0.0.1` - `255.255.255.255`.

The address: `0.0.0.0` is interpreted as `NULL`.

The following operators support `string` type arguments to permit the passing of
netmasks:

- `<<`
  [Strict IP address contained by](/docs/query/operators/ipv4/#-left-strict-ip-address-contained-by)
- `<<=`
  [IP address contained by or equal](/docs/query/operators/ipv4/#-left-ip-address-contained-by-or-equal)
- [rnd_ipv4(string, int)](/docs/query/functions/random-value-generator/#rnd_ipv4string-int)
- [netmask()](/docs/query/operators/ipv4/#return-netmask---netmaskstring)

## `<` Less than

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is less than another.

```sql
ipv4 '33.1.8.43' < ipv4 '200.6.38.9' -> T
```

## `<=` Less than or equal

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is less than or equal to another.

```sql
ipv4 '33.1.8.43' <= ipv4 '33.1.8.43' -> T
```

## `>` Greater than

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is greater than another.

```sql
ipv4 '33.1.8.43' > ipv4 '200.6.38.9' -> F
```

## `>=` Greater than or equal

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is greater than or equal to another.

```sql
ipv4 '33.1.8.43' >= ipv4 '200.6.38.9' -> F
```

## `=` Equals

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is equal to another.

```sql
ipv4 '44.8.9.10' = ipv4 '6.2.90.1' -> F
```

## `!=` Does not equal

Takes two IPv4 arguments.

Returns a boolean.

#### Examples

Use case: testing to see if one IP address is not equal to another.

```sql
ipv4 '44.8.9.10' != ipv4 '6.2.90.1' -> T
```

## `<<` Left strict IP address contained by

Takes one IPv4 argument and one string argument.

The string argument can accept IPv4 addresses with a subnet mask, the IPv4
argument cannot.

Returns a boolean.

#### Examples

Use case: searching ip addresses by subnet

```sql
ipv4 '35.24.65.11' << '35.24.65.2/16' -> T
ipv4 '35.24.65.11' << '35.24.65.2/32' -> F
```

## `>>` Right strict IP address contained by

Takes one IPv4 argument and one string argument.

The string argument can accept IPv4 addresses with a subnet mask, the IPv4
argument cannot.

Returns a boolean.

#### Examples

Use case: searching ip addresses by subnet

```sql
'35.24.65.2/16' >> ipv4 '35.24.65.11' -> T
'35.24.65.2/32'  >> ipv4 '35.24.65.11' -> F
```

## `<<=` Left IP address contained by or equal

Takes one IPv4 argument and one string argument

The string argument can accept IPv4 addresses with a subnet mask, the IPv4
argument cannot.

Returns a boolean.

#### Examples

Use case: searching ip addresses by subnet

```sql
ipv4 '35.24.65.11' <<= '35.24.65.2/16' -> T
ipv4 '35.24.65.11' <<= '35.24.65.2/32' -> T
```

## `<<=` Right IP address contained by or equal

Takes one IPv4 argument and one string argument

The string argument can accept IPv4 addresses with a subnet mask, the IPv4
argument cannot.

Returns a boolean.

#### Examples

Use case: searching ip addresses by subnet

```sql
'35.24.65.2/16' >>= ipv4 '35.24.65.11'  -> T
'35.24.65.2/32' >>= ipv4 '35.24.65.11'  -> T
```

## `&` Bitwise AND

Takes two IPv4 arguments.

Returns an IPv4 address.

#### Examples

Use case: separating an ip address into its network and host portions

```sql
ipv4 '215.53.40.9' & ipv4 '255.255.0.0' -> 215.53.0.0
ipv4 '99.8.63.41' & ipv4 '0.0.63.41' -> 0.0.63.41
```

## `~` Bitwise NOT

Takes one IPv4 argument.

Returns an IPv4 address.

#### Examples

Use case: computing broadcast address' bitmask from a netmask

```sql
~ ipv4 '255.255.0.0' -> 0.0.255.255
```

## `|` Bitwise OR

Takes two IPv4 arguments.

Returns an IPv4 address.

#### Examples

Use case: computing an ip address' broadcast address

```sql
ipv4 '92.11.8.40' | '0.0.255.255' -> 92.11.255.255
```

## `+` Add offset to an IP address

Takes one IPv4 argument and one integer argument.

Returns an IPv4 address.

#### Examples

Use case: altering an ip address

```sql
ipv4 '92.11.8.40' + 5 -> 92.11.8.45
10 + ipv4 '2.6.43.8' -> 2.6.43.18
```

## `-` Subtract offset from IP address

Takes one IPv4 argument and one integer argument.

Returns an IPv4 address.

#### Examples

```sql
ipv4 '92.11.8.40' - 5 -> 92.11.8.35
```

## `-` Difference between two IP addresses

Takes two IPv4 arguments.

Returns a long.

#### Examples

Use case: calculating the range of unique addresses between two ip addresses

```sql
ipv4 '92.11.8.40' - ipv4 '92.11.8.0' -> 40
```

## Return netmask - netmask(string)

Takes a `string` IPv4 argument as either:

- ipv4 address with a netmask `22.59.138.9/8`
- subnet with netmask: `2.2/16`

Returns an IPv4 addresses' netmask (`255.0.0.0`) in IPv4 format.

#### Examples

Use case: Obtaining the broadcast bitmask for an ip address via performing
bitwise NOT on the netmask.

Apply a bitwise OR to this result to obtain the broadcast address of an ip
address.

```sql
~ netmask('68.11.9.2/8')) | ipv4 '68.11.9.2' -> 68.255.255.255
```
