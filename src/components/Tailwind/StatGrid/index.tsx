import StatItem from "./StatItem"

const defaultStats = [
  { id: 1, name: "Avg ingested rows/sec", value: "3M+" },
  { id: 2, name: "Write speed vs InfluxDB", value: "10x" },
  { id: 3, name: "Compression ratio", value: "6x" },
  { id: 4, name: "Cloud up-time", value: "99.99999%" },
]

function StatGrid({ stats = defaultStats }) {
  return (
    <div className="py-12 sm:py-16 w-full">
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        <div className="mx-auto max-w-none">
          <dl className="mt-1 grid grid-cols-1 gap-0.5 overflow-hidden rounded-2xl text-center sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <StatItem key={stat.id} stat={stat} />
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

export default StatGrid
