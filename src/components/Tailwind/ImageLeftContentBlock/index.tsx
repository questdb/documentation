import TextContent from "./TextContent"
import ImageContent from "./ImageContent"
import MermaidBlock from "../MermaidContentBlock/MermaidBlock"

const ImageLeftContentBlock = ({ contentData }) => {
  return (
    <div className="overflow-hidden py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-24 gap-y-16 sm:gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            {contentData.useMermaid ? (
              <MermaidBlock chart={contentData.mermaidChart} />
            ) : (
              <ImageContent
                src={contentData.imageSrc}
                alt={contentData.imageAlt}
                width={contentData.width || "auto"}
                height={contentData.height || "auto"}
              />
            )}
          </div>
          <div className="order-1 lg:order-2">
            <TextContent
              title={contentData.title}
              headline={contentData.headline}
              description={contentData.description}
              features={contentData.features}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ImageLeftContentBlock
