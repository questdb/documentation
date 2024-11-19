const FeatureItem = ({ name, description, Icon, url }) => (
  <div className="relative pl-9">
    <dt className="inline font-semibold">
      <Icon
        className="absolute left-1 top-1 h-5 w-5 text-primary"
        aria-hidden="true"
      />
      <a className="text-primary underline" href={url}>
        {name}
      </a>
    </dt>
    <dd className="inline ml-2.5">{description}</dd>
  </div>
)

export default FeatureItem
