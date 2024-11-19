const CallToAction = ({ href, label }) => {
  return (
    <div className="mt-8">
      <a
        href={href}
        className="inline-flex rounded-md bg-primary hover:text-white px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {label}
      </a>
    </div>
  )
}

export default CallToAction
