function StatItem({ stat }) {
  return (
    <div className="flex flex-col bg-gray-400/5 p-6">
      <dt className="text-sm font-semibold leading-6">{stat.name}</dt>
      <dd className="order-first text-3xl font-semibold tracking-tight">
        {stat.value}
      </dd>
    </div>
  )
}

export default StatItem
