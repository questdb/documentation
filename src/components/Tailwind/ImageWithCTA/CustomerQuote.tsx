const CustomerQuote = ({ quote, author, position, imageUrl }) => {
  return (
    <figure className="mt-16 border-l border-gray-200 pl-8">
      <blockquote className="text-base leading-7">
        <p>{quote}</p>
      </blockquote>
      <figcaption className="mt-6 flex gap-x-4 text-sm leading-6">
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="h-6 w-15 flex-none svg-mode-visible"
        />
        <div>
          <span className="font-semibold">{author}</span> — {position}
        </div>
      </figcaption>
    </figure>
  )
}

export default CustomerQuote
