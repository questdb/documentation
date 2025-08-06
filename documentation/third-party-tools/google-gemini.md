---
title: Google Gemini
slug: google-gemini
description:
  Learn how to integrate QuestDB with Google Gemini for AI-powered time-series
  data analysis and multimodal insights.
---

# Google Gemini Integration

QuestDB integrates with Google's Gemini AI models to enable powerful multimodal
analysis of time-series data. Gemini's advanced capabilities allow you to
analyze not just text and data, but also images, charts, and visualizations from
your QuestDB datasets.

## Overview

Google Gemini is a family of multimodal AI models that can understand and
analyze text, images, and data simultaneously. When integrated with QuestDB,
Gemini can:

- Analyze time-series data with visual context
- Generate insights from charts and graphs
- Create comprehensive reports with visual elements
- Provide multimodal data exploration
- Support code generation and debugging
- Offer multilingual analysis capabilities

## Prerequisites

Before integrating Gemini with QuestDB, ensure you have:

- A QuestDB instance running and accessible
- A Google AI API key (sign up at
  [makersuite.google.com](https://makersuite.google.com))
- Python 3.8+ installed
- Network access to both QuestDB and Google AI APIs

## Installation

Install the required dependencies:

```bash
pip install google-generativeai questdb pandas pillow matplotlib
```

## Basic Integration

### 1. Connect to QuestDB

```python
import google.generativeai as genai
from questdb.ingress import Sender
import pandas as pd
import matplotlib.pyplot as plt
import io
from PIL import Image

# Configure Gemini
genai.configure(api_key="your-api-key")

# Connect to QuestDB
sender = Sender('localhost', 9009)
```

### 2. Multimodal Data Analysis

```python
def analyze_data_with_gemini(data_summary, chart_image=None):
    """
    Analyze time-series data using Gemini with optional visual context
    """
    prompt = f"""
    Analyze this time-series data and provide comprehensive insights:

    Data Summary:
    {data_summary}

    Please provide:
    1. Key trends and patterns identified
    2. Statistical insights and correlations
    3. Anomalies or unusual patterns
    4. Business implications and recommendations
    5. Suggested next steps for deeper analysis
    """

    # Create the model
    model = genai.GenerativeModel('gemini-pro')

    if chart_image:
        # Use multimodal analysis with image
        model = genai.GenerativeModel('gemini-pro-vision')
        response = model.generate_content([prompt, chart_image])
    else:
        # Text-only analysis
        response = model.generate_content(prompt)

    return response.text

# Example usage
data_summary = """
- Dataset: Stock market data for tech companies
- Time range: Last 6 months
- Companies: AAPL, GOOGL, MSFT, TSLA
- Metrics: Price, volume, market cap
- Visual: Price trend chart included
"""

# Create a sample chart
fig, ax = plt.subplots()
ax.plot([1, 2, 3, 4, 5], [100, 110, 105, 120, 115])
ax.set_title('Stock Price Trend')
ax.set_xlabel('Time')
ax.set_ylabel('Price ($)')

# Convert plot to image
buf = io.BytesIO()
plt.savefig(buf, format='png')
buf.seek(0)
chart_image = Image.open(buf)

analysis = analyze_data_with_gemini(data_summary, chart_image)
print(analysis)
```

### 3. SQL Query Generation with Context

```python
def generate_sql_with_gemini(natural_query, table_schema, data_context=None):
    """
    Convert natural language to SQL using Gemini with data context
    """
    prompt = f"""
    Convert this natural language query to SQL for QuestDB time-series database:

    Query: "{natural_query}"

    Table schema: {table_schema}

    Additional context: {data_context if data_context else 'None'}

    Important QuestDB specifics:
    - Use TIMESTAMP for time columns
    - Use SYMBOL for categorical data
    - Use designated timestamp for time-series optimization
    - Support for SAMPLE BY for time-based aggregations

    Return only the SQL query, no explanations.
    """

    model = genai.GenerativeModel('gemini-pro')
    response = model.generate_content(prompt)

    return response.text.strip()

# Example usage
table_schema = """
CREATE TABLE market_data (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE,
    volume LONG,
    market_cap DOUBLE
) timestamp(timestamp);
"""

data_context = "Recent data shows high volatility in tech stocks, with AAPL showing strong performance"

sql_query = generate_sql_with_gemini(
    "Show me the average price and volume for tech stocks over the last week",
    table_schema,
    data_context
)
print(f"Generated SQL: {sql_query}")
```

## Advanced Use Cases

### Visual Data Analysis

```python
def analyze_chart_with_gemini(chart_image, analysis_request):
    """
    Analyze charts and visualizations using Gemini's vision capabilities
    """
    prompt = f"""
    Analyze this chart and provide insights:

    Analysis Request: {analysis_request}

    Please identify:
    1. Key patterns and trends visible in the chart
    2. Anomalies or unusual data points
    3. Potential causes for observed patterns
    4. Recommendations based on the visualization
    5. Questions that should be investigated further
    """

    model = genai.GenerativeModel('gemini-pro-vision')
    response = model.generate_content([prompt, chart_image])

    return response.text

# Example usage
def create_sample_chart():
    """Create a sample time-series chart"""
    import numpy as np

    dates = pd.date_range('2024-01-01', periods=30, freq='D')
    values = np.random.randn(30).cumsum() + 100

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.plot(dates, values, marker='o')
    ax.set_title('Time Series Data Analysis')
    ax.set_xlabel('Date')
    ax.set_ylabel('Value')
    ax.grid(True)

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=300, bbox_inches='tight')
    buf.seek(0)
    return Image.open(buf)

chart = create_sample_chart()
analysis = analyze_chart_with_gemini(
    chart,
    "Identify trends and potential anomalies in this time series data"
)
print(analysis)
```

### Code Generation and Debugging

```python
def generate_questdb_code_with_gemini(description, requirements):
    """
    Generate QuestDB code using Gemini
    """
    prompt = f"""
    Generate Python code for QuestDB integration based on this description:

    Description: {description}
    Requirements: {requirements}

    Include:
    1. Connection setup
    2. Data ingestion code
    3. Query examples
    4. Error handling
    5. Best practices

    Use the questdb-client library and follow QuestDB best practices.
    """

    model = genai.GenerativeModel('gemini-pro')
    response = model.generate_content(prompt)

    return response.text

# Example usage
description = "Create a system to ingest IoT sensor data and generate alerts for anomalies"
requirements = """
- Temperature, humidity, and pressure sensors
- Real-time data ingestion
- Anomaly detection
- Alert system
- Data visualization
"""

code = generate_questdb_code_with_gemini(description, requirements)
print(code)
```

### Multilingual Analysis

```python
def analyze_data_multilingual(data, language="en"):
    """
    Analyze data in multiple languages using Gemini
    """
    language_prompts = {
        "en": "Analyze this time-series data and provide insights:",
        "es": "Analiza estos datos de series temporales y proporciona insights:",
        "fr": "Analysez ces données de séries temporelles et fournissez des insights:",
        "de": "Analysieren Sie diese Zeitreihendaten und geben Sie Einblicke:",
        "zh": "分析这些时间序列数据并提供见解：",
        "ja": "時系列データを分析し、洞察を提供してください："
    }

    prompt = f"""
    {language_prompts.get(language, language_prompts["en"])}

    Data: {data}

    Provide analysis in {language.upper()} language.
    """

    model = genai.GenerativeModel('gemini-pro')
    response = model.generate_content(prompt)

    return response.text

# Example usage
data = "Market data showing 20% increase in trading volume with price volatility"
analysis_en = analyze_data_multilingual(data, "en")
analysis_es = analyze_data_multilingual(data, "es")
analysis_ja = analyze_data_multilingual(data, "ja")

print(f"English: {analysis_en}")
print(f"Spanish: {analysis_es}")
print(f"Japanese: {analysis_ja}")
```

## Model Selection

Gemini offers different models for different use cases:

### Gemini Pro (Text Analysis)

- Best for text-based analysis and code generation
- Excellent for SQL generation and data analysis
- Suitable for most QuestDB integration tasks

```python
model = genai.GenerativeModel('gemini-pro')
response = model.generate_content(prompt)
```

### Gemini Pro Vision (Multimodal)

- Best for analyzing charts, graphs, and visual data
- Can understand both text and images
- Perfect for data visualization analysis

```python
model = genai.GenerativeModel('gemini-pro-vision')
response = model.generate_content([prompt, image])
```

### Gemini Flash (Fast Processing)

- Fastest response times
- Suitable for simple queries and basic analysis
- Most cost-effective for high-volume tasks

```python
model = genai.GenerativeModel('gemini-1.5-flash')
response = model.generate_content(prompt)
```

## Best Practices

### 1. Model Selection

- Use Gemini Pro for complex text analysis and code generation
- Use Gemini Pro Vision for chart and visualization analysis
- Use Gemini Flash for simple queries and high-volume tasks

### 2. Prompt Engineering

- Be specific about your data structure and requirements
- Include context about your business domain
- Use structured prompts for consistent results
- Provide examples when possible

### 3. Error Handling

```python
def safe_gemini_call(prompt, max_retries=3):
    """
    Safely call Gemini API with retry logic
    """
    for attempt in range(max_retries):
        try:
            model = genai.GenerativeModel('gemini-pro')
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
                continue
            print(f"Error calling Gemini API: {e}")
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

You can integrate Gemini directly into the QuestDB Web Console:

```javascript
// Example JavaScript integration
async function analyzeWithGemini(dataQuery, chartImage = null) {
  const formData = new FormData()
  formData.append("query", dataQuery)
  if (chartImage) {
    formData.append("image", chartImage)
  }

  const response = await fetch("/api/gemini/analyze", {
    method: "POST",
    body: formData,
  })

  const result = await response.json()
  return result.analysis
}
```

## Monitoring and Analytics

```python
import logging
from datetime import datetime

class GeminiMonitor:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def log_request(self, model, prompt_length, response_length, cost):
        self.logger.info(f"""
        Gemini Request:
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

- Explore [Google AI's documentation](https://ai.google.dev/docs) for advanced
  features
- Check out [QuestDB's Python client documentation](/docs/reference/api/python/)
  for more integration options
- Consider implementing streaming responses for real-time analysis
- Set up automated monitoring and alerting based on Gemini insights

## Support

For issues with this integration:

- Check the [Google AI status page](https://status.ai.google.dev/)
- Review [QuestDB troubleshooting guides](/docs/troubleshooting/)
- Join the [QuestDB community](https://community.questdb.com/) for help
