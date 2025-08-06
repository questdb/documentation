---
title: Mistral AI
slug: mistral
description:
  Learn how to integrate QuestDB with Mistral AI for efficient and
  cost-effective AI-powered time-series data analysis.
---

# Mistral AI Integration

QuestDB integrates with Mistral AI's powerful language models to enable
efficient and cost-effective AI-powered analysis of time-series data. Mistral AI
offers high-performance models that are particularly well-suited for data
analysis tasks and can provide excellent results at competitive pricing.

## Overview

Mistral AI provides a range of models including Mistral 7B, Mixtral 8x7B, and
the latest Mistral Large. When integrated with QuestDB, these models can:

- Perform natural language querying of time-series data
- Generate insights and analysis reports
- Create data visualizations and summaries
- Provide recommendations based on historical patterns
- Analyze complex data relationships and correlations
- Support multilingual data analysis

## Prerequisites

Before integrating Mistral AI with QuestDB, ensure you have:

- A QuestDB instance running and accessible
- A Mistral AI API key (sign up at
  [console.mistral.ai](https://console.mistral.ai))
- Python 3.8+ installed
- Network access to both QuestDB and Mistral AI APIs

## Installation

Install the required dependencies:

```bash
pip install mistralai questdb pandas
```

## Basic Integration

### 1. Connect to QuestDB

```python
from mistralai.client import MistralClient
from mistralai.models.chat_completion import ChatMessage
from questdb.ingress import Sender
import pandas as pd

# Initialize Mistral client
client = MistralClient(api_key="your-api-key")

# Connect to QuestDB
sender = Sender('localhost', 9009)
```

### 2. Natural Language Data Analysis

```python
def analyze_data_with_mistral(data_summary, analysis_request):
    """
    Analyze time-series data using Mistral AI
    """
    prompt = f"""
    Analyze this time-series data and provide comprehensive insights:

    Data Summary:
    {data_summary}

    Analysis Request:
    {analysis_request}

    Please provide:
    1. Key trends and patterns identified
    2. Statistical insights and correlations
    3. Anomalies or unusual patterns
    4. Business implications and recommendations
    5. Suggested next steps for deeper analysis
    """

    messages = [
        ChatMessage(role="user", content=prompt)
    ]

    response = client.chat(
        model="mistral-large-latest",
        messages=messages,
        max_tokens=1000,
        temperature=0.3
    )

    return response.choices[0].message.content

# Example usage
data_summary = """
- Dataset: IoT sensor data from manufacturing plant
- Time range: Last 30 days
- Sensors: Temperature, humidity, pressure, vibration
- Records: 50,000 data points
- Anomalies detected: 3 temperature spikes, 2 pressure drops
"""

analysis = analyze_data_with_mistral(
    data_summary,
    "Identify equipment health patterns and predict maintenance needs"
)
print(analysis)
```

### 3. SQL Query Generation

```python
def generate_sql_with_mistral(natural_query, table_schema):
    """
    Convert natural language to SQL using Mistral AI
    """
    prompt = f"""
    Convert this natural language query to SQL for QuestDB time-series database:

    Query: "{natural_query}"

    Table schema: {table_schema}

    Important QuestDB specifics:
    - Use TIMESTAMP for time columns
    - Use SYMBOL for categorical data
    - Use designated timestamp for time-series optimization
    - Support for SAMPLE BY for time-based aggregations

    Return only the SQL query, no explanations.
    """

    messages = [
        ChatMessage(role="user", content=prompt)
    ]

    response = client.chat(
        model="mistral-large-latest",
        messages=messages,
        max_tokens=200,
        temperature=0.1
    )

    return response.choices[0].message.content.strip()

# Example usage
table_schema = """
CREATE TABLE sensor_data (
    timestamp TIMESTAMP,
    sensor_id SYMBOL,
    temperature DOUBLE,
    humidity DOUBLE,
    pressure DOUBLE
) timestamp(timestamp);
"""

sql_query = generate_sql_with_mistral(
    "Show me the average temperature by sensor for the last 24 hours",
    table_schema
)
print(f"Generated SQL: {sql_query}")
```

## Advanced Use Cases

### Real-time Data Monitoring

```python
import asyncio
from datetime import datetime

class MistralDataMonitor:
    def __init__(self, questdb_connection):
        self.connection = questdb_connection
        self.client = MistralClient(api_key="your-api-key")

    async def monitor_data_stream(self, data_stream, alert_thresholds):
        """
        Monitor real-time data streams using Mistral AI
        """
        while True:
            # Get latest data
            latest_data = await self._get_latest_data(data_stream)

            # Analyze with Mistral
            analysis = await self._analyze_with_mistral(latest_data, alert_thresholds)

            # Check for alerts
            if self._should_alert(analysis):
                await self._trigger_alert(analysis)

            await asyncio.sleep(60)  # Check every minute

    async def _analyze_with_mistral(self, data, thresholds):
        prompt = f"""
        Analyze this real-time data for potential issues:

        Data: {data}
        Alert Thresholds: {thresholds}

        Determine if any values exceed thresholds or show concerning patterns.
        Provide confidence scores and recommended actions.
        """

        messages = [ChatMessage(role="user", content=prompt)]

        response = self.client.chat(
            model="mistral-large-latest",
            messages=messages,
            max_tokens=500,
            temperature=0.2
        )

        return response.choices[0].message.content

    def _should_alert(self, analysis):
        # Parse analysis and determine if alert is needed
        return "CRITICAL" in analysis.upper() or "ALERT" in analysis.upper()

    async def _trigger_alert(self, analysis):
        # Implement alert mechanism
        print(f"ALERT: {analysis}")
```

### Predictive Analytics

```python
def predict_trends_with_mistral(historical_data, prediction_horizon):
    """
    Use Mistral AI for trend prediction and forecasting
    """
    prompt = f"""
    Analyze this historical time-series data and predict future trends:

    Historical Data: {historical_data}
    Prediction Horizon: {prediction_horizon}

    Please provide:
    1. Trend analysis and patterns
    2. Seasonal components identified
    3. Predicted values for the next {prediction_horizon} periods
    4. Confidence intervals for predictions
    5. Factors that could affect predictions
    6. Recommendations for monitoring
    """

    messages = [ChatMessage(role="user", content=prompt)]

    response = client.chat(
        model="mistral-large-latest",
        messages=messages,
        max_tokens=1500,
        temperature=0.2
    )

    return response.choices[0].message.content

# Example usage
historical_data = """
- Stock price data for AAPL
- 6 months of daily closing prices
- Clear upward trend with some volatility
- Seasonal patterns around earnings announcements
"""

predictions = predict_trends_with_mistral(historical_data, "30 days")
print(predictions)
```

### Multilingual Data Analysis

```python
def analyze_data_multilingual(data, language="en"):
    """
    Analyze data in multiple languages using Mistral AI
    """
    language_prompts = {
        "en": "Analyze this time-series data and provide insights:",
        "es": "Analiza estos datos de series temporales y proporciona insights:",
        "fr": "Analysez ces données de séries temporelles et fournissez des insights:",
        "de": "Analysieren Sie diese Zeitreihendaten und geben Sie Einblicke:",
        "zh": "分析这些时间序列数据并提供见解："
    }

    prompt = f"""
    {language_prompts.get(language, language_prompts["en"])}

    Data: {data}

    Provide analysis in {language.upper()} language.
    """

    messages = [ChatMessage(role="user", content=prompt)]

    response = client.chat(
        model="mistral-large-latest",
        messages=messages,
        max_tokens=1000,
        temperature=0.3
    )

    return response.choices[0].message.content

# Example usage
data = "Market data showing 15% increase in trading volume over last week"
analysis_en = analyze_data_multilingual(data, "en")
analysis_es = analyze_data_multilingual(data, "es")
print(f"English: {analysis_en}")
print(f"Spanish: {analysis_es}")
```

## Model Selection

Mistral AI offers different models for different use cases:

### Mistral Large (Recommended for Analysis)

- Best for complex data analysis tasks
- Higher accuracy and reasoning capabilities
- Suitable for detailed reports and insights

```python
# For detailed analysis
response = client.chat(
    model="mistral-large-latest",
    messages=messages,
    max_tokens=2000,
    temperature=0.3
)
```

### Mistral Medium (Balanced Performance)

- Good balance of speed and accuracy
- Suitable for most data analysis tasks
- Cost-effective for regular monitoring

```python
# For regular monitoring
response = client.chat(
    model="mistral-medium-latest",
    messages=messages,
    max_tokens=1000,
    temperature=0.2
)
```

### Mistral Small (Fast Processing)

- Fastest response times
- Suitable for simple queries and basic analysis
- Most cost-effective for high-volume tasks

```python
# For simple queries
response = client.chat(
    model="mistral-small-latest",
    messages=messages,
    max_tokens=500,
    temperature=0.1
)
```

## Best Practices

### 1. Model Selection

- Use Mistral Large for complex analysis and detailed reports
- Use Mistral Medium for regular monitoring and standard analysis
- Use Mistral Small for simple queries and high-volume tasks

### 2. Prompt Engineering

- Be specific about your data structure and requirements
- Include context about your business domain
- Use clear, structured prompts for consistent results

### 3. Error Handling

```python
from mistralai.exceptions import MistralAPIError

def safe_mistral_call(prompt, max_retries=3):
    """
    Safely call Mistral AI with retry logic
    """
    for attempt in range(max_retries):
        try:
            messages = [ChatMessage(role="user", content=prompt)]
            response = client.chat(
                model="mistral-large-latest",
                messages=messages,
                max_tokens=1000,
                temperature=0.3
            )
            return response.choices[0].message.content
        except MistralAPIError as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
                continue
            raise
        except Exception as e:
            print(f"Error calling Mistral AI: {e}")
            return None
```

### 4. Cost Optimization

- Use appropriate model sizes for your use case
- Batch requests when possible
- Cache results to avoid redundant API calls
- Monitor usage and costs

### 5. Security

- Never send sensitive data without proper anonymization
- Use environment variables for API keys
- Implement proper access controls
- Validate and sanitize all inputs

## Integration with QuestDB Web Console

You can integrate Mistral AI directly into the QuestDB Web Console:

```javascript
// Example JavaScript integration
async function analyzeWithMistral(dataQuery) {
  const response = await fetch("/api/mistral/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: dataQuery,
      model: "mistral-large-latest",
      context: getCurrentTableSchema(),
    }),
  })

  const result = await response.json()
  return result.analysis
}
```

## Monitoring and Analytics

```python
import logging
from datetime import datetime

class MistralMonitor:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def log_request(self, model, prompt_length, response_length, cost):
        self.logger.info(f"""
        Mistral AI Request:
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

- Explore [Mistral AI's documentation](https://docs.mistral.ai/) for advanced
  features
- Check out [QuestDB's Python client documentation](/docs/reference/api/python/)
  for more integration options
- Consider implementing streaming responses for real-time analysis
- Set up automated monitoring and alerting based on Mistral AI insights

## Support

For issues with this integration:

- Check the [Mistral AI status page](https://status.mistral.ai/)
- Review [QuestDB troubleshooting guides](/docs/troubleshooting/)
- Join the [QuestDB community](https://community.questdb.com/) for help
