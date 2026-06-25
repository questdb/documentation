-- Keep a heading (or a stack of consecutive headings) together with the table
-- that immediately follows it. longtable does its own internal page placement and
-- ignores surrounding \nobreak/penalties, so the only reliable lever is to move
-- the HEADING(s) proactively: insert a \Needspace* before the first heading of a
-- "heading(s) -> table" run. \Needspace* breaks only when the reserve won't fit
-- (no \penalty -100), unlike \needspace which can spuriously break early under
-- \raggedbottom. If the reserve doesn't fit, the whole stack + the table's header
-- + first rows move to the next page (longtable splits the rest), so the heading
-- is never stranded above an empty gap.
--
-- Only headings that actually precede a table get a reserve (heading->text and
-- heading->heading->text rely on \@afterheading\nobreak in the template instead),
-- so there's no extra whitespace elsewhere.

local RESERVE = '150pt'  -- ~ stack + table header + first rows

function Pandoc(doc)
  local b = doc.blocks
  local out = pandoc.List()
  for i = 1, #b do
    local blk = b[i]
    -- start of a heading run that isn't preceded by another heading
    if blk.t == 'Header' and (i == 1 or b[i-1].t ~= 'Header') then
      local j = i
      while j <= #b and b[j].t == 'Header' do j = j + 1 end
      if j <= #b and b[j].t == 'Table' then
        out:insert(pandoc.RawBlock('latex', '\\Needspace*{' .. RESERVE .. '}'))
      end
    end
    out:insert(blk)
  end
  return pandoc.Pandoc(out, doc.meta)
end
