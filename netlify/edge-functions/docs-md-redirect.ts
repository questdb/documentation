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
    const mdPath = normalizedPath === '/'
      ? '/index.md'
      : `${normalizedPath}index.md`;

    const mdUrl = new URL(mdPath, url.origin);
    return Response.redirect(mdUrl);
  }
};

export const config = {
  path: "/*",
  method: "GET",
  excludedPath: ["/*.md", "/assets/*", "/images/*", "/fonts/*", "/*.mdx", "/*.css", "/*.js", "/*.png", "/*.jpg", "/*.jpeg", "/*.gif", "/*.svg", "/*.ico", "/*.webp", "/*.woff", "/*.woff2", "/*.ttf", "/*.eot", "/*.otf", "/*.ico", "/*.webp", "/*.woff", "/*.woff2", "/*.ttf", "/*.eot", "/*.otf", "/*.webmanifest"],
  headers: {
    "Accept": "(text/markdown|text/plain)"
  }
}
