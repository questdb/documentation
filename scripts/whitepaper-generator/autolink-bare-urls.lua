-- Turn bare QuestDB URLs (no scheme) into proper links so they pick up the
-- inline-link styling (medium, underlined, #9C274B). Pandoc's built-in
-- autolink_bare_uris only links URLs that already have a scheme, so schemeless
-- mentions like "demo.questdb.com" or "questdb.com/compare/x" slip through.
--
-- Scoped to *questdb.<tld> domains to avoid false positives (e.g. "e.g.").
-- Prepends https:// for the href and keeps trailing punctuation as plain text.
-- Applied via --lua-filter in generate-pdf.sh; no markdown changes needed.
--
-- Traversal is the default bottom-up order: the Str pass runs first, then the
-- Link pass. A bare URL outside any link becomes a top-level Link. A bare URL
-- that is the label of an *existing* link would briefly become a nested Link;
-- the Link pass then flattens that nesting, so existing links stay single and
-- there is no re-traversal loop (each node is visited exactly once).

-- Str: wrap a bare questdb URL in a Link.
function Str(el)
  local s = el.text
  local startp, endp = s:find("[%w%-%._/]*questdb%.[%w%-%._/]+")
  if not startp then return nil end

  local pre  = s:sub(1, startp - 1)
  local url  = s:sub(startp, endp)
  local post = s:sub(endp + 1)

  local trailing = url:match("[%.%,%:%;%!%?%)]+$")  -- keep sentence punctuation out of the link
  if trailing then
    url  = url:sub(1, #url - #trailing)
    post = trailing .. post
  end
  if url == "" then return nil end

  local out = {}
  if pre ~= "" then table.insert(out, pandoc.Str(pre)) end
  table.insert(out, pandoc.Link(pandoc.Str(url), "https://" .. url))
  if post ~= "" then table.insert(out, pandoc.Str(post)) end
  return out
end

-- Link: flatten any nested link inside this link's label (keeps THIS target).
function Link(el)
  el.content = el.content:walk{
    Link = function(inner) return inner.content end
  }
  return el
end
