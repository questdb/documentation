---
title: Sankey and Funnel Diagrams
sidebar_label: Sankey/funnel diagrams
description: Create session-based analytics for Sankey diagrams and conversion funnels
---

Build user journey flow data for Sankey diagrams and conversion funnels by sessionizing event data and tracking state transitions.

## Problem

You want to build a user-flow or Sankey diagram to find out which pages contribute visits to others, and in which proportion. You'd like to track elapsed time, number of pages in a single session, entry/exit pages, etc., similar to web analytics tools.

Your issue is that you only capture a flat table with events, with no concept of session. For analytics purposes, you want to define a session as a visit that was more than 1 hour apart from the last one for the same user.

Your simplified table schema:

```questdb-sql
CREATE TABLE events (
    visitor_id SYMBOL,
    pathname SYMBOL,
    timestamp TIMESTAMP,
    metric_name SYMBOL
) TIMESTAMP(timestamp) PARTITION BY MONTH WAL;
```

## Solution: Session Window Functions

By combining window functions and `CASE` statements:

1. Sessionize the data by identifying gaps longer than 1 hour
2. Generate unique session ids for aggregations
3. Assign sequence numbers to each hit within a session
4. Assign the session initial timestamp
5. Check next page in the sequence

With that, you can count page hits for the next page from current, identify elapsed time between hits or since the start of the session, count sessions per user, or power navigation funnels and Sankey diagrams.

```questdb-sql title="Sessionize events and track page flows"
WITH PrevEvents AS (
  SELECT
    visitor_id,
    pathname,
    timestamp,
    lag(timestamp) OVER (PARTITION BY visitor_id ORDER BY timestamp) AS prev_ts
  FROM
    events WHERE timestamp > dateadd('d', -7, now())
    AND metric_name = 'page_view'
), VisitorSessions AS (
  SELECT *,
    SUM(CASE WHEN datediff('h', timestamp, prev_ts) > 1 THEN 1 END)
    OVER(
      PARTITION BY visitor_id
      ORDER BY timestamp
    ) as local_session_id FROM PrevEvents

), GlobalSessions AS (
  SELECT visitor_id, pathname, timestamp, prev_ts,
    concat(visitor_id, '#', coalesce(local_session_id,0)::int) AS session_id
  FROM VisitorSessions
), EventSequences AS (
  SELECT *, row_number() OVER (
      PARTITION BY session_id ORDER BY timestamp
    ) as session_sequence,
    row_number() OVER (
      PARTITION BY session_id ORDER BY timestamp DESC
    ) as reverse_session_sequence,
    first_value(timestamp::long) OVER (
      PARTITION BY session_id ORDER BY timestamp
    ) as session_ts
  FROM GlobalSessions
), EventsFullInfo AS (
  SELECT e1.session_id, e1.session_ts::timestamp as session_ts, e1.visitor_id,
    e1.timestamp, e1.pathname, e1.session_sequence,
    CASE WHEN e1.session_sequence = 1 THEN true END is_entry_page,
    e2.pathname as next_pathname, datediff('T', e1.timestamp, e1.prev_ts)::double as elapsed,
    e2.reverse_session_sequence,
    CASE WHEN e2.reverse_session_sequence = 1 THEN true END is_exit_page
  FROM EventSequences e1
  LEFT JOIN EventSequences e2 ON (e1.session_id = e2.session_id)
  WHERE e2.session_sequence - e1.session_sequence = 1
)
SELECT * FROM EventsFullInfo;
```

:::info Related Documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [LAG function](/docs/query/functions/window-functions/reference/#lag)
:::
