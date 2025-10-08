"use client"

import { CSSProperties, useEffect, useRef, useState, useCallback } from 'react'
import { PlusIcon, MinusIcon } from '@heroicons/react/24/outline'
import styles from './styles.module.css'
import ChartGrouped from './three-tier-chart-grouped'

type TextProps = { text: string; className?: string; style?: CSSProperties; variant?: number }

const phrases = [
  "WHERE symbol in ('AAPL', 'NVDA')",
  "LATEST ON timestamp PARTITION BY symbol",
  "CREATE MATERIALIZED VIEW 'trades_OHLC'",
  "min(price) AS low",
  "timestamp IN today()",
  "SELECT spread_bps(bids[1][1], asks[1][1])",
  "FROM read_parquet('trades.parquet')",
  "SAMPLE BY 15m",
]

const positions: { top?: string; bottom?: string; left?: string; right?: string }[] = [
  { top: '20%', left: '22%' },
  { top: '40%', right: '10%' },
  { top: '42%', left: '25%' },
  { top: '50%', right: '12%' },
  { top: '68%', right: '20%' },
  { bottom: '35%', right: '9%' },
  { bottom: '22%', left: '20%' },
  { bottom: '1%', right: '30%' },
]

const groupIds: { id: string, visibleIndexes: (0 | 1 | 2)[], trigger?: (0 | 1 | 2) }[] = [
  { id: 'Tier 1 Group', visibleIndexes: [0] },
  { id: 'Category Group & Header', visibleIndexes: [1] },
  { id: 'Category Group_4', visibleIndexes: [1] },
  { id: 'Category Group_5', visibleIndexes: [2] },
  { id: 'Category Group_6', visibleIndexes: [2] },
  { id: 'SQL Queries Flow', visibleIndexes: [2] },
  { id: 'Deduplicate Flow', visibleIndexes: [0, 1] },
  { id: 'Protocol Flow', visibleIndexes: [1] },
  { id: 'Native Access Flow', visibleIndexes: [2] },
  { id: 'Historical Data Flow', visibleIndexes: [1, 2] },
]

const Text = ({ text, className, style, variant = 0 }: TextProps) => {
  return (
    <div className={className} style={style}>
      <div className={`${styles.driftX1} ${variant % 4 === 1 ? styles.driftX2 : ''} ${variant % 4 === 2 ? styles.driftX3 : ''} ${variant % 4 === 3 ? styles.driftX4 : ''}`}>
        <div className={`${styles.driftY1} ${variant % 4 === 1 ? styles.driftY2 : ''} ${variant % 4 === 2 ? styles.driftY3 : ''} ${variant % 4 === 3 ? styles.driftY4 : ''}`}>
          <div
            className={`${styles.monoText} inline-block shadow-lg shadow-[0px_0px_0px_0.75px_rgba(255,255,255,0.025)] rounded-md bg-[#21222C] opacity-30 px-2 md:px-3 text-[6px] md:text-[11px] font-medium leading-5 text-[#9089FCA3]`}
            style={{
              whiteSpace: 'nowrap',
              boxShadow:
                '0 10px 15px rgba(0,0,0,0.075), 0 4px 6px rgba(0,0,0,0.075), 0 0 0 1px rgba(255,255,255,0.025)',
            }}
          >
            {text}
          </div>
        </div>
      </div>
    </div>
  )
}

const Background = ({ expandedIndex }: { expandedIndex: number | null }) => {
  return (
    <>
      <div className={`${styles.gridBackground} ${expandedIndex === null ? '' : styles.gridBackgroundDimmed} lg:transition-opacity lg:duration-200 pointer-events-none`} />
      <svg className={`absolute z-0 inset-0 left-1/2 -translate-x-1/2 w-full h-full ${expandedIndex === null ? 'opacity-100' : 'opacity-30'} transition-opacity duration-200 pointer-events-none`} viewBox="0 0 1200 1000" fill="none" preserveAspectRatio="xMidYMid slice">
        <g opacity="0.64" filter="url(#filter0_f_347_25241)">
          <g clipPath="url(#clip0_347_25241)">
            <mask id="mask0_347_25241" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="104" y="104" width="1039" height="593">
              <g clipPath="url(#clip1_347_25241)">
                <path d="M776.001 461.103L974.394 295.186L1065.37 439.063L1036.87 587.931L983.163 599.159L799.019 512.25L575.415 443.638L478.959 451.538L462.517 507.676L520.61 608.723L202.742 512.666L-29.6299 661.949L28.4632 458.608L203.839 511.834L614.875 246.949L776.001 461.103Z" fill="black"/>
              </g>
            </mask>
            <g mask="url(#mask0_347_25241)">
              <rect opacity="0.2" x="104" y="104.05" width="1038.75" height="592.5" fill="url(#paint0_linear_347_25241)"/>
            </g>
          </g>
        </g>
        <defs>
          <filter id="filter0_f_347_25241" x="0" y="0.0498047" width="1304.46" height="800.5" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix"/>
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feGaussianBlur stdDeviation="52" result="effect1_foregroundBlur_347_25241"/>
          </filter>
          <linearGradient id="paint0_linear_347_25241" x1="368.379" y1="847.351" x2="878.371" y2="-46.7509" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF80B5"/>
          <stop offset="1" stopColor="#B1B5D3"/>
          </linearGradient>
          <clipPath id="clip0_347_25241">
          <rect width="1038.75" height="592.5" fill="white" transform="translate(104 104.05)"/>
          </clipPath>
          <clipPath id="clip1_347_25241">
          <rect width="1038.75" height="592.5" fill="white" transform="translate(104 104.05)"/>
          </clipPath>
        </defs>
      </svg>
      {phrases.map((p, i) => (
        <Text key={i} text={p} className="absolute pointer-events-none" style={positions[i]} variant={i} />
      ))}
    </>
  )
}

const InfoBox = ({ title, description, text, index, expandedIndex, setExpandedIndex, className }: { title: string; description: string; text: string; index: number; expandedIndex: number | null; setExpandedIndex: (index: number | null) => void; className?: string }) => {
  return (
    <div className={`flex flex-col max-w-[500px] border-solid border border-[#FFFFFF26] bg-[var(--palette-charade)] opacity-100 rounded-[12px] px-3 overflow-hidden lg:transition-all lg:duration-200 ${expandedIndex === index ? 'py-4 max-h-[1000px] bg-code' : 'py-4 max-h-[82px]'} ${className || ''}`}>
      <div className="flex gap-4 items-center justify-between">
        <p className="p-0 m-0 w-unset"><b>{title}:</b> {description}</p>
        <button
          data-expander="true"
          className="min-w-8 min-h-8 flex-0 p-0 flex items-center justify-center bg-transparent rounded-[10px] border-solid border border-[#FFFFFF26] text-[#FFFFFF26] hover:text-gray-400 hover:border-gray-400 lg:transition-all lg:duration-200"
          onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
        >
          {expandedIndex === index ? <MinusIcon data-expander="true" className="w-6 h-6 text-inherit" /> : <PlusIcon data-expander="true" className="w-6 h-6 text-inherit" />}
        </button>
      </div>
      <p className={`p-0 mb-0 lg:transition-all lg:duration-200 ${expandedIndex === index ? 'opacity-100 mt-6' : 'opacity-0 h-0'}`}>{text}</p>
    </div>
  )
}

const Tiers = ({ expandedIndex, setExpandedIndex }: { expandedIndex: number | null, setExpandedIndex: (index: number) => void }) => {
  const getElementByIdInsideSVG = useCallback((id: string) => {
    const svg = document.getElementById('three-tier-chart-grouped') as SVGSVGElement | null
    if (!svg) return null
    return svg.getElementById(id) as SVGElement | null
  }, [])

  useEffect(() => {
    const registered: { el: SVGElement, handler: (e: Event) => void }[] = []
    groupIds.forEach(group => {
      const el = getElementByIdInsideSVG(group.id)
      if (!el) return
      if (group.visibleIndexes.length === 1) {
        el.setAttribute("data-expander", "true")
        const handler = () => setExpandedIndex(group.visibleIndexes[0])
        el.addEventListener("click", handler)
        registered.push({ el, handler })
      }
      el.style.transition = 'opacity 0.2s ease-in-out'
    })
    return () => {
      registered.forEach(({ el, handler }) => {
        el.removeEventListener("click", handler)
      })
    }
  }, [])

  useEffect(() => {
    const indexesToShow = expandedIndex !== null ? [expandedIndex] : [0, 1, 2]
    groupIds.forEach(group => {
      const el = getElementByIdInsideSVG(group.id)
      if (!el) return
      if (group.visibleIndexes.some(index => indexesToShow.includes(index))) {
        el.style.opacity = '1'
      } else {
        el.style.opacity = '0.2'
      }
    })
  }, [expandedIndex])

  return (
    <div className="relative">
      <div className="relative">
        <div className="origin-top-left">
          <ChartGrouped id="three-tier-chart-grouped" className="w-full h-full" />
        </div>
      </div>
    </div>
  )
}

export default function ThreeTierChart({ className }: { className?: string }) {
  const [expandedIndex, _setExpandedIndex] = useState<number | null>(null)
  const isExpandedBefore = useRef(false)

  const setExpandedIndex = (index: number | null) => {
    isExpandedBefore.current = true
    _setExpandedIndex(index)
  }

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (expandedIndex !== null && !(e.target as HTMLElement).closest('[data-expander="true"]')) {
        setExpandedIndex(null)
      }
    }

    document.addEventListener('click', handleOutsideClick)

    return () => document.removeEventListener('click', handleOutsideClick)
  }, [expandedIndex])

  return (
    <div className={`relative ${className ?? ''} w-full my-12`}>
      <Background expandedIndex={expandedIndex} />
      <div id="architecture" className="flex flex-col md:flex-row lg:flex-col xl:flex-row items-center md:items-start lg:items-center xl:items-start justify-between gap-8 relative z-10">
        <Tiers expandedIndex={expandedIndex} setExpandedIndex={setExpandedIndex} />
        <div className="flex flex-col gap-4 items-end items-stretch">
          <InfoBox
            title="Tier One"
            description="Hot ingest (WAL), durable by default"
            text="Incoming data is appended to the write-ahead log (WAL) with ultra-low latency. Writes are made durable before any processing, preserving order and surviving failures without data loss. The WAL is asynchronously shipped to object storage, so new replicas can bootstrap quickly and read the same history."
            index={0}
            expandedIndex={expandedIndex}
            setExpandedIndex={setExpandedIndex}
            className={!isExpandedBefore.current ? "shadow-[0_10px_15px_-2px_rgba(201,50,97,0.25),0_4px_6px_-4px_rgba(201,50,97,0.25)]" : ''}
          />
          <InfoBox
            title="Tier Two"
            description="Real-time SQL on live data"
            text="Data is time-ordered and de-duplicated into QuestDB's native, time-partitioned columnar format and becomes immediately queryable. Power real-time analysis with vectorized, multi-core execution, streaming materialized views, and time-series SQL (e.g., ASOF JOIN, SAMPLE BY). The query planner spans tiers seamlessly."
            index={1}
            expandedIndex={expandedIndex}
            setExpandedIndex={setExpandedIndex}
          />
          <InfoBox
            title="Tier Three"
            description="Cold storage, open and queryable"
            text="Older data is automatically tiered to object storage in Apache Parquet. Query it in-place through QuestDB or use any tool that reads Parquet. This delivers predictable costs, interoperability with AI/ML tooling, and zero lock-in."
            index={2}
            expandedIndex={expandedIndex}
            setExpandedIndex={setExpandedIndex}
          />
        </div>
      </div>
    </div>
  )
}
