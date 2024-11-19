function QuoteComponent({ quote }) {
  return (
    <blockquote className="text-xl font-semibold leading-8 sm:text-2xl sm:leading-9">
      <p>{quote}</p>
    </blockquote>
  )
}

export default QuoteComponent
