import type { Context } from '@netlify/edge-functions';

export default async (request: Request, context: Context) => {
  const getAdjustedPos = (header: string, searchString: string): number => {
    const pos = header.indexOf(searchString);
    return pos !== -1 ? pos : Number.MAX_SAFE_INTEGER;
  }
  context.log("Interrupt: ", request.url);

  const shouldServeMarkdown = (acceptHeader: string): boolean => {
    const markdownPos = getAdjustedPos(acceptHeader, 'text/markdown')
    const plainPos = getAdjustedPos(acceptHeader, 'text/plain');
    const minMdPos = Math.min(markdownPos, plainPos);
    const htmlPos = getAdjustedPos(acceptHeader, 'text/html');
    
    return minMdPos < htmlPos;
  }

  const acceptHeader = request.headers.get('Accept') || '';
  const serveMarkdown = shouldServeMarkdown(acceptHeader);

  if (serveMarkdown) {
    const url = new URL(request.url);
    const pathname = url.pathname.trim();
    const normalizedPath = pathname.endsWith('/') ? pathname : pathname + '/';
    const mdPath = normalizedPath === '/docs/'
      ? '/docs/index.md'
      : `${normalizedPath}index.md`;

    const mdUrl = new URL(mdPath, url.origin);
    return Response.redirect(mdUrl);
  }
};

export const config = {
  path: "/docs/*",
  method: "GET",
  excludedPath: ["/docs/*.md", "/docs/assets/*", "/assets/*", "/docs/*.mdx", "/docs/*.css", "/docs/*.js", "/docs/*.png", "/docs/*.jpg", "/docs/*.jpeg", "/docs/*.gif", "/docs/*.svg", "/docs/*.ico", "/docs/*.webp", "/docs/*.woff", "/docs/*.woff2", "/docs/*.ttf", "/docs/*.eot", "/docs/*.otf", "/docs/*.ico", "/docs/*.webp", "/docs/*.woff", "/docs/*.woff2", "/docs/*.ttf", "/docs/*.eot", "/docs/*.otf", "/docs/*.webmanifest"],
  headers: {
    "Accept": "(text/markdown|text/plain)"
  }
}
