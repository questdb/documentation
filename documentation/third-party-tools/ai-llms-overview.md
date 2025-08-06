---
title: AI and LLMs Overview
slug: ai-llms-overview
description:
  Learn how to integrate QuestDB with AI and Large Language Models for
  intelligent time-series data analysis and insights.
---

# AI and LLMs Integration Overview

QuestDB integrates with various AI and Large Language Model (LLM) providers to
enable intelligent analysis of time-series data. These integrations allow you to
leverage the power of AI to extract insights, generate reports, and interact
with your data using natural language.

## Overview

AI and LLM integrations with QuestDB provide powerful capabilities for
time-series data analysis:

- **Natural Language Querying**: Convert plain English questions to SQL queries
- **Intelligent Data Analysis**: Automatically identify patterns, trends, and
  anomalies
- **Automated Reporting**: Generate comprehensive reports and insights
- **Predictive Analytics**: Forecast future trends based on historical data
- **Anomaly Detection**: Identify unusual patterns and potential issues
- **Data Visualization**: Create charts and graphs with AI-generated insights

## Available Integrations

### Anthropic Claude

- **Best for**: Complex reasoning and detailed analysis
- **Strengths**: Safety-focused, excellent for business insights
- **Use cases**: Executive reporting, strategic analysis, compliance
- **[Learn more](/docs/third-party-tools/anthropic-claude/)**

### OpenAI ChatGPT

- **Best for**: Natural language interaction and general analysis
- **Strengths**: Versatile, excellent prompt engineering capabilities
- **Use cases**: Interactive data exploration, natural language queries
- **[Learn more](/docs/third-party-tools/openai-chatgpt/)**

### Mistral AI

- **Best for**: Cost-effective analysis and multilingual support
- **Strengths**: High performance, competitive pricing, multilingual
- **Use cases**: Regular monitoring, cost-sensitive applications
- **[Learn more](/docs/third-party-tools/mistral/)**

### Google Gemini

- **Best for**: Multimodal analysis and visual data interpretation
- **Strengths**: Vision capabilities, code generation, multilingual
- **Use cases**: Chart analysis, visual data exploration, code generation
- **[Learn more](/docs/third-party-tools/google-gemini/)**

## Common Use Cases

### 1. Natural Language Data Exploration

```python
# Example: Ask questions in plain English
question = "What was the highest trading volume day for AAPL last week?"
# AI converts to: SELECT timestamp, volume FROM market_data WHERE symbol = 'AAPL' AND timestamp > dateadd('d', -7, now()) ORDER BY volume DESC LIMIT 1
```

### 2. Automated Insights Generation

```python
# Example: Generate insights from data
data_summary = "Market data showing 15% increase in volume over last week"
insights = ai_analyze(data_summary)
# Returns: "The 15% volume increase suggests growing market interest, potentially indicating..."
```

### 3. Predictive Analytics

```python
# Example: Predict future trends
historical_data = "6 months of daily stock prices with clear upward trend"
prediction = ai_predict(historical_data, "30 days")
# Returns: "Based on historical patterns, expect continued growth with 85% confidence..."
```

### 4. Anomaly Detection

```python
# Example: Detect unusual patterns
sensor_data = "Temperature readings showing normal range 20-25°C"
anomalies = ai_detect_anomalies(sensor_data)
# Returns: "Detected 3 temperature spikes above 30°C on Tuesday, Wednesday, Friday..."
```

## Getting Started

### Prerequisites

Before integrating AI/LLM tools with QuestDB, ensure you have:

- A QuestDB instance running and accessible
- API keys for your chosen AI provider
- Python 3.8+ installed
- Network access to both QuestDB and AI APIs

### Basic Setup

1. **Choose your AI provider** based on your needs:

   - **Claude**: For complex reasoning and business analysis
   - **ChatGPT**: For natural language interaction
   - **Mistral**: For cost-effective, multilingual analysis

2. **Install dependencies**:

   ```bash
   # For Claude
   pip install anthropic questdb-client pandas

   # For ChatGPT
   pip install openai questdb-client pandas

   # For Mistral
   pip install mistralai questdb-client pandas
   ```

3. **Set up your API key**:
   ```python
   import os
   os.environ['ANTHROPIC_API_KEY'] = 'your-claude-key'
   os.environ['OPENAI_API_KEY'] = 'your-openai-key'
   os.environ['MISTRAL_API_KEY'] = 'your-mistral-key'
   ```

## Integration Patterns

### Pattern 1: Query Translation

Convert natural language to SQL for QuestDB:

```python
def natural_to_sql(question, table_schema):
    prompt = f"Convert '{question}' to SQL for QuestDB with schema: {table_schema}"
    sql = ai_generate(prompt)
    return execute_query(sql)
```

### Pattern 2: Data Analysis

Analyze query results with AI:

```python
def analyze_results(data, question):
    prompt = f"Analyze this data to answer: {question}\nData: {data}"
    analysis = ai_analyze(prompt)
    return analysis
```

### Pattern 3: Automated Monitoring

Set up AI-powered alerts:

```python
def monitor_data(data_stream):
    while True:
        latest_data = get_latest_data()
        analysis = ai_analyze(latest_data)
        if "ALERT" in analysis:
            send_alert(analysis)
        time.sleep(60)
```

## Best Practices

### 1. Model Selection

- **Claude**: Use for complex analysis requiring deep reasoning
- **ChatGPT**: Use for interactive exploration and general tasks
- **Mistral**: Use for cost-sensitive applications and multilingual needs

### 2. Prompt Engineering

- Be specific about your data structure
- Include context about your business domain
- Use structured prompts for consistent results
- Provide examples when possible

### 3. Cost Optimization

- Use appropriate model sizes for your use case
- Batch requests when possible
- Cache results to avoid redundant API calls
- Monitor usage and costs

### 4. Security

- Never send sensitive data without proper anonymization
- Use environment variables for API keys
- Implement proper access controls
- Validate and sanitize all inputs

### 5. Error Handling

- Implement retry logic with exponential backoff
- Handle rate limits gracefully
- Log errors for debugging
- Provide fallback mechanisms

## Performance Considerations

### Response Times

- **Claude**: 2-5 seconds for complex analysis
- **ChatGPT**: 1-3 seconds for general queries
- **Mistral**: 1-4 seconds depending on model size

### Token Usage

- **Claude**: ~$0.015 per 1K input tokens, ~$0.075 per 1K output tokens
- **ChatGPT**: ~$0.03 per 1K input tokens, ~$0.06 per 1K output tokens
- **Mistral**: ~$0.007 per 1K input tokens, ~$0.024 per 1K output tokens

### Caching Strategies

```python
import hashlib
import json

def cache_key(prompt, model):
    return hashlib.md5(f"{prompt}:{model}".encode()).hexdigest()

def cached_ai_call(prompt, model, cache):
    key = cache_key(prompt, model)
    if key in cache:
        return cache[key]

    result = ai_call(prompt, model)
    cache[key] = result
    return result
```

## Monitoring and Analytics

Track your AI integration performance:

```python
class AIMonitor:
    def __init__(self):
        self.metrics = {
            'total_requests': 0,
            'successful_requests': 0,
            'total_cost': 0.0,
            'average_response_time': 0.0
        }

    def log_request(self, provider, model, tokens, cost, response_time, success):
        self.metrics['total_requests'] += 1
        if success:
            self.metrics['successful_requests'] += 1
        self.metrics['total_cost'] += cost
        # Update average response time
        # Implementation details...

    def get_metrics(self):
        return self.metrics
```

## Integration with QuestDB Web Console

You can integrate AI capabilities directly into the QuestDB Web Console:

```javascript
// Example: Natural language query interface
async function queryWithAI(naturalQuery) {
  const response = await fetch("/api/ai/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: naturalQuery,
      provider: "claude", // or 'openai', 'mistral'
      context: getCurrentTableSchema(),
    }),
  })

  const result = await response.json()
  return {
    sql: result.sql,
    analysis: result.analysis,
    visualization: result.visualization,
  }
}
```

## Troubleshooting

### Common Issues

1. **Rate Limiting**: Implement exponential backoff
2. **Token Limits**: Break large requests into smaller chunks
3. **API Errors**: Check API status pages and implement retry logic
4. **Cost Overruns**: Set up usage alerts and monitoring

### Debugging Tips

```python
def debug_ai_call(prompt, model, response):
    print(f"Prompt: {prompt}")
    print(f"Model: {model}")
    print(f"Response: {response}")
    print(f"Tokens used: {estimate_tokens(prompt + response)}")
    print(f"Estimated cost: ${estimate_cost(prompt + response, model)}")
```

## Next Steps

- Choose your preferred AI provider and follow their specific integration guide
- Start with simple queries and gradually increase complexity
- Set up monitoring and cost tracking
- Consider implementing caching for frequently used queries
- Explore advanced features like streaming responses and real-time analysis

## Support

For issues with AI/LLM integrations:

- Check the respective provider's status page
- Review [QuestDB troubleshooting guides](/docs/troubleshooting/)
- Join the [QuestDB community](https://community.questdb.com/) for help
- Consult the specific provider's documentation for API-related issues
