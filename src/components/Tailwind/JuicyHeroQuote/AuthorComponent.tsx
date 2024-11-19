function AuthorComponent({ authorName, authorTitle, caseStudyUrl }) {
  return (
    <figcaption className="mt-8 text-base">
      <div className="font-semibold">{authorName}</div>
      <div className="mt-1">{authorTitle}</div>
      {caseStudyUrl && (
        <a href={caseStudyUrl} className="mt-2 text-sm text-primary">
          Read case study
        </a>
      )}
    </figcaption>
  )
}

export default AuthorComponent
