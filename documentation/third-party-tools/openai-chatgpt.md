---
title: OpenAI ChatGPT
slug: openai-chatgpt
description:
  Learn how to integrate QuestDB with OpenAI ChatGPT for AI-powered time-series
  data analysis and natural language querying.
---

# OpenAI ChatGPT Integration

QuestDB integrates with OpenAI's ChatGPT and GPT models to enable natural
language querying and intelligent analysis of time-series data. This integration
allows you to interact with your QuestDB data using plain English and leverage
AI capabilities for data exploration and insights.

## Overview

OpenAI's ChatGPT and GPT models provide powerful natural language processing
capabilities. When integrated with QuestDB, these models can:

- Convert natural language queries to SQL
- Analyze time-series data patterns and trends
- Generate insights and explanations in plain English
- Create automated reports and visualizations
- Provide data-driven recommendations
- Answer complex questions about your data

## Prerequisites

Before integrating ChatGPT with QuestDB, ensure you have:

- A QuestDB instance running and accessible
- An OpenAI API key (sign up at
  [platform.openai.com](https://platform.openai.com))
- Python 3.8+ installed
- Network access to both QuestDB and OpenAI APIs

## Installation

Install the required dependencies:

```bash
pip install openai questdb pandas sqlalchemy
```

## Basic Integration

### 1. Connect to QuestDB

```python
import openai
from questdb.ingress import Sender
import pandas as pd
import sqlalchemy as sa

# Initialize OpenAI client
client = openai.OpenAI(api_key="your-api-key")

# Connect to QuestDB
sender = Sender('localhost', 9009)
```

### 2. Natural Language to SQL Conversion

```python
def natural_language_to_sql(natural_query, table_schema):
    """
    Convert natural language query to SQL using ChatGPT
    """
    prompt = f"""
    Convert this natural language query to SQL for QuestDB:

    Query: "{natural_query}"

    Table schema: {table_schema}

    Return only the SQL query, no explanations.
    """

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a SQL expert for QuestDB time-series database."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=200,
        temperature=0.1
    )

    return response.choices[0].message.content.strip()

# Example usage
table_schema = """
CREATE TABLE market_data (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE,
    volume LONG
) timestamp(timestamp);
"""

query = natural_language_to_sql(
    "Show me the average price of AAPL for the last 7 days",
    table_schema
)
print(f"Generated SQL: {query}")
```

### 3. Data Analysis with ChatGPT

```python
def analyze_data_with_chatgpt(data_summary, analysis_request):
    """
    Analyze data using ChatGPT
    """
    prompt = f"""
    Analyze this time-series data and provide insights:

    Data Summary:
    {data_summary}

    Analysis Request:
    {analysis_request}

    Please provide:
    1. Key trends and patterns
    2. Anomalies or unusual behavior
    3. Business insights and recommendations
    4. Potential next steps for analysis
    """

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a data analyst expert specializing in time-series data analysis."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=1000,
        temperature=0.3
    )

    return response.choices[0].message.content

# Example usage
data_summary = """
- Dataset: Market data for AAPL, GOOGL, MSFT
- Time range: Last 30 days
- Records: 15,000 data points
- Price range: $150 - $200 for AAPL
- Volume patterns: Higher volume on weekdays
"""

analysis = analyze_data_with_chatgpt(
    data_summary,
    "Identify trading patterns and potential investment opportunities"
)
print(analysis)
```

## Advanced Use Cases

### Interactive Data Explorer

```python
class QuestDBDataExplorer:
    def __init__(self, questdb_connection):
        self.connection = questdb_connection
        self.client = openai.OpenAI(api_key="your-api-key")

    def explore_data(self, user_question):
        """
        Interactive data exploration using natural language
        """
        # First, convert question to SQL
        sql_query = self._question_to_sql(user_question)

        # Execute query
        results = self._execute_query(sql_query)

        # Analyze results with ChatGPT
        analysis = self._analyze_results(results, user_question)

        return {
            'sql_query': sql_query,
            'results': results,
            'analysis': analysis
        }

    def _question_to_sql(self, question):
        prompt = f"""
        Convert this question to SQL for QuestDB:
        Question: {question}

        Available tables:
        - market_data (timestamp, symbol, price, volume)
        - sensor_data (timestamp, sensor_id, value, location)
        - user_activity (timestamp, user_id, action, duration)

        Return only the SQL query.
        """

        response = self.client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a SQL expert for QuestDB."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=200,
            temperature=0.1
        )

        return response.choices[0].message.content.strip()

    def _execute_query(self, sql_query):
        # Execute the SQL query and return results
        # Implementation depends on your QuestDB connection method
        pass

    def _analyze_results(self, results, original_question):
        prompt = f"""
        Analyze these query results and answer the original question:

        Original Question: {original_question}
        Query Results: {results}

        Provide a clear, insightful answer based on the data.
        """

        response = self.client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a data analyst expert."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0.3
        )

        return response.choices[0].message.content

# Usage example
explorer = QuestDBDataExplorer(questdb_connection)
result = explorer.explore_data("What was the highest trading volume day for AAPL last week?")
print(result['analysis'])
```

### Automated Report Generation

```python
def generate_automated_report(data_query, report_type="daily"):
    """
    Generate automated reports using ChatGPT
    """
    # Execute data query
    data = execute_query(data_query)

    # Generate report based on type
    if report_type == "daily":
        prompt = f"""
        Generate a daily market report based on this data:
        {data}

        Include:
        - Executive summary
        - Key performance indicators
        - Market trends and patterns
        - Risk assessment
        - Recommendations for tomorrow
        """
    elif report_type == "weekly":
        prompt = f"""
        Generate a weekly analysis report:
        {data}

        Include:
        - Weekly performance summary
        - Trend analysis
        - Comparative analysis
        - Forecast for next week
        - Strategic recommendations
        """

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a financial analyst expert."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=2000,
        temperature=0.3
    )

    return response.choices[0].message.content
```

### Real-time Alert System

```python
def create_smart_alerts(data_stream, alert_criteria):
    """
    Create intelligent alerts using ChatGPT
    """
    alert_prompt = f"""
    Analyze this real-time data and determine if alerts should be triggered:

    Data: {data_stream}
    Alert Criteria: {alert_criteria}

    Determine if any alerts should be triggered and provide:
    1. Alert level (info, warning, critical)
    2. Alert message
    3. Recommended actions
    4. Confidence score
    """

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are an alert system expert."},
            {"role": "user", "content": alert_prompt}
        ],
        max_tokens=300,
        temperature=0.1
    )

    return response.choices[0].message.content
```

## Best Practices

### 1. Prompt Engineering

- Be specific and clear in your prompts
- Provide context about your data schema
- Use system messages to set the AI's role
- Include examples when possible

### 2. Error Handling

```python
def safe_openai_call(prompt, max_retries=3):
    """
    Safely call OpenAI API with retry logic
    """
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1000,
                temperature=0.3
            )
            return response.choices[0].message.content
        except openai.RateLimitError:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
                continue
            raise
        except Exception as e:
            print(f"Error calling OpenAI API: {e}")
            return None
```

### 3. Cost Optimization

- Use appropriate model sizes (gpt-3.5-turbo for simple tasks)
- Batch requests when possible
- Cache results to avoid redundant calls
- Monitor API usage and costs

### 4. Security

- Never send sensitive data without proper anonymization
- Use environment variables for API keys
- Implement proper access controls
- Validate and sanitize all inputs

## Integration with QuestDB Web Console

You can integrate ChatGPT directly into the QuestDB Web Console:

```javascript
// Example JavaScript integration
async function queryWithChatGPT(naturalQuery) {
  const response = await fetch("/api/chatgpt/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: naturalQuery,
      context: getCurrentTableSchema(),
    }),
  })

  const result = await response.json()
  return result.sql
}
```

## Monitoring and Analytics

```python
import logging
from datetime import datetime

class ChatGPTMonitor:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def log_request(self, prompt_length, response_length, model, cost):
        self.logger.info(f"""
        ChatGPT Request:
        - Timestamp: {datetime.now()}
        - Model: {model}
        - Prompt length: {prompt_length} tokens
        - Response length: {response_length} tokens
        - Estimated cost: ${cost:.4f}
        """)

    def track_performance(self, response_time, success):
        # Track performance metrics
        pass
```

## Next Steps

- Explore [OpenAI's documentation](https://platform.openai.com/docs/) for
  advanced features
- Check out [QuestDB's Python client documentation](/docs/reference/api/python/)
  for more integration options
- Consider implementing streaming responses for real-time analysis
- Set up automated monitoring and alerting based on ChatGPT insights

## Support

For issues with this integration:

- Check the [OpenAI status page](https://status.openai.com/)
- Review [QuestDB troubleshooting guides](/docs/troubleshooting/)
- Join the [QuestDB community](https://community.questdb.com/) for help
