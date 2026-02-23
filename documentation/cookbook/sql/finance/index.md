---
title: Capital Markets Recipes
sidebar_label: Overview
description: SQL recipes for financial analysis including technical indicators, volatility metrics, volume analysis, and risk measurement in QuestDB.
---

# Capital Markets Recipes

This section contains SQL recipes for financial market analysis. All recipes use the
[demo dataset](/docs/cookbook/demo-data-schema/) available in the QuestDB web console.

## Price-Based Indicators

Foundation recipes for price analysis and trend identification.

| Recipe | Description |
|--------|-------------|
| [OHLC Aggregation](ohlc.md) | Aggregate tick data into candlestick bars |
| [VWAP](vwap.md) | Volume-Weighted Average Price |
| [Bollinger Bands](bollinger-bands.md) | Price channels based on standard deviation |
| [Bollinger BandWidth](bollinger-bandwidth.md) | Measure band expansion and contraction |

## Momentum Indicators

Measure the speed and strength of price movements.

| Recipe | Description |
|--------|-------------|
| [RSI](rsi.md) | Relative Strength Index for overbought/oversold conditions |
| [MACD](macd.md) | Moving Average Convergence Divergence |
| [Stochastic Oscillator](stochastic.md) | Compare closing price to price range |
| [Rate of Change](rate-of-change.md) | Percentage price change over N periods |

## Volatility Indicators

Quantify market uncertainty and price variability.

| Recipe | Description |
|--------|-------------|
| [ATR](atr.md) | Average True Range |
| [Rolling Std Dev](rolling-stddev.md) | Moving standard deviation of returns |
| [Donchian Channels](donchian-channels.md) | High/low price channels |
| [Keltner Channels](keltner-channels.md) | EMA-based volatility channels |
| [Realized Volatility](realized-volatility.md) | Historical volatility from returns |

## Volume & Order Flow

Analyze trading activity and order flow dynamics.

| Recipe | Description |
|--------|-------------|
| [OBV](obv.md) | On-Balance Volume |
| [Volume Profile](volume-profile.md) | Volume distribution by price level |
| [Volume Spike](volume-spike.md) | Detect abnormal volume |
| [Aggressor Imbalance](aggressor-volume-imbalance.md) | Buy vs sell pressure |
| [VPIN](vpin.md) | Volume-synchronized informed trading probability |

## Risk Metrics

Portfolio risk measurement and drawdown analysis.

| Recipe | Description |
|--------|-------------|
| [Maximum Drawdown](maximum-drawdown.md) | Peak-to-trough decline |

## Market Microstructure

Analyze market quality and trading costs.

| Recipe | Description |
|--------|-------------|
| [Bid-Ask Spread](bid-ask-spread.md) | Spread metrics and analysis |
| [Liquidity Comparison](liquidity-comparison.md) | Compare liquidity across instruments |

## Post-Trade Analysis

Measure execution quality, fill performance, and trading costs. Also available as a [top-level sidebar section](/docs/cookbook/sql/finance/) for quick access.

| Recipe | Description |
|--------|-------------|
| [Slippage](slippage.md) | Measure execution slippage per fill |
| [Slippage (aggregated)](slippage-aggregated.md) | Compare slippage across venues and counterparties |
| [Markout analysis](markout.md) | Post-trade price reversion and adverse selection |
| [Last look detection](last-look.md) | Millisecond-granularity markout for last-look analysis |
| [Implementation shortfall](implementation-shortfall.md) | Cost decomposition into spread, permanent, and temporary impact |
| [Implementation shortfall (order)](implementation-shortfall-order.md) | Total IS per order vs arrival mid |
| [ECN scorecard](ecn-scorecard.md) | Dashboard-style venue comparison combining spread, slippage, and fill metrics |

## Market Breadth

Measure overall market participation and sentiment.

| Recipe | Description |
|--------|-------------|
| [TICK & TRIN](tick-trin.md) | Market breadth indicators |

## Math Utilities

General-purpose financial calculations.

| Recipe | Description |
|--------|-------------|
| [Compound Interest](compound-interest.md) | Interest and growth calculations |
| [Cumulative Product](cumulative-product.md) | Running product for returns |
