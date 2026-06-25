-- Style pandoc table cells: colour every cell #21222C (questdb-charade) and bold
-- the header cells. Done with inline \textcolor / \textbf wrappers rather than a
-- vertical-mode \color near the longtable — a bare \color at/around a longtable
-- start emits a whatsit that makes longtable output an orphaned "phantom" header.
-- Replaces the old bold-table-headers.lua (which only bolded headers).

local function wrap_inlines(inl, bold)
  local open  = bold and '\\textbf{\\textcolor{questdb-charade}{' or '\\textcolor{questdb-charade}{'
  local close = bold and '}}' or '}'
  local r = pandoc.List({ pandoc.RawInline('latex', open) })
  r:extend(inl)
  r:insert(pandoc.RawInline('latex', close))
  return r
end

local function style_cell(cell, bold)
  cell.contents = cell.contents:map(function(b)
    if b.t == 'Plain' then return pandoc.Plain(wrap_inlines(b.content, bold))
    elseif b.t == 'Para' then return pandoc.Para(wrap_inlines(b.content, bold))
    else return b end
  end)
end

local function style_rows(rows, bold)
  for _, row in ipairs(rows) do
    for _, cell in ipairs(row.cells) do style_cell(cell, bold) end
  end
end

function Table(tbl)
  style_rows(tbl.head.rows, true)        -- header rows: bold + colour
  for _, body in ipairs(tbl.bodies) do
    style_rows(body.head, true)          -- intermediate heads (rare): bold + colour
    style_rows(body.body, false)         -- body rows: colour only
  end
  style_rows(tbl.foot.rows, false)
  return tbl
end
