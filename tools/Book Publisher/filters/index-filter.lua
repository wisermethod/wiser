--[[
  Index Filter for Pandoc

  Converts custom index markers to LaTeX \index{} commands.

  Syntax in markdown:
    {{idx:Term}}                    -> \index{Term}
    {{idx:Main!Sub}}                -> \index{Main!Sub} (subentry)
    {{idx:Term|(}}                  -> \index{Term|(} (start page range)
    {{idx:Term|)}}                  -> \index{Term|)} (end page range)
    {{idx:Term|see{Other}}}         -> \index{Term|see{Other}}
    {{idx:Term|seealso{Other}}}     -> \index{Term|seealso{Other}}

  A term may hold spaces and may wrap across a source line. Every form above
  accepts a multi-word term.

  For non-LaTeX output (EPUB, HTML), index markers are silently removed.

  Usage:
    pandoc input.md -o output.pdf --lua-filter=index-filter.lua
]]

-- Patterns matching index markers: {{idx:content}}
--
-- The cross-reference forms carry one brace group inside the marker
-- ({{idx:Term|see{Other}}}), and a single character-class pattern stops at that
-- group's closing brace, leaving a stray "}" behind in the text. So the balanced
-- form runs first and takes those markers whole; the plain form then takes the
-- brace-free markers that remain. Both classes exclude "{" and "}", which is
-- what keeps either pattern from running past the end of one marker into the
-- next.
local INDEX_PATTERN_NESTED = "{{idx:([^{}]*%b{}[^{}]*)}}"
local INDEX_PATTERN = "{{idx:([^{}]+)}}"

-- Check if we're outputting to LaTeX/PDF
local function is_latex_output()
  return FORMAT:match("latex") or FORMAT:match("pdf") or FORMAT:match("tex")
end

-- What one marker becomes: an \index command for LaTeX, nothing anywhere else.
local function index_command(term)
  if is_latex_output() then
    return "\\index{" .. term .. "}"
  end
  return ""
end

-- ============================================================================
-- INLINE RUNS
--
-- A marker is written in prose, and pandoc splits prose at every space, so
-- {{idx:supply chain}} arrives as Str "{{idx:supply", Space, Str "chain}}".
-- Matching inside one Str therefore sees only single-word markers and leaves
-- every multi-word one in the text. Markers are resolved here instead, over a
-- run of adjacent text inlines joined back into one string, so a term may hold
-- spaces and may wrap across a source line.
-- ============================================================================

-- The text an inline contributes to a run, or nil if it ends the run. Anything
-- with structure of its own (Emph, Code, Link, an image) ends it: a marker never
-- spans one, and passing it through untouched keeps that structure intact.
local function run_text(inline)
  local t = inline.t
  if t == "Str" then return inline.text end
  if t == "Space" or t == "SoftBreak" then return " " end
  return nil
end

-- Append one Space, unless the last inline already is one. Removing a marker
-- that sat between two spaces would otherwise leave two in its place.
local function push_space(acc)
  if acc[#acc] and acc[#acc].t == "Space" then return end
  acc[#acc + 1] = pandoc.Space()
end

-- Append plain text as Str and Space inlines. Text stays text: it is never
-- folded into the raw LaTeX below, so pandoc still escapes whatever it carries
-- (a "%" or "&" beside a marker would otherwise reach LaTeX unescaped).
local function push_text(acc, text)
  local pos = 1
  while pos <= #text do
    local first, last = text:find("%s+", pos)
    if not first then
      acc[#acc + 1] = pandoc.Str(text:sub(pos))
      return
    end
    if first > pos then
      acc[#acc + 1] = pandoc.Str(text:sub(pos, first - 1))
    end
    push_space(acc)
    pos = last + 1
  end
end

-- The first marker at or after init. The balanced form is tried at every
-- position the plain form reaches, so a cross-reference marker is taken whole
-- rather than cut at its inner brace.
local function find_marker(text, init)
  local nested_start, nested_end, nested_term = text:find(INDEX_PATTERN_NESTED, init)
  local plain_start, plain_end, plain_term = text:find(INDEX_PATTERN, init)
  if nested_start and (not plain_start or nested_start <= plain_start) then
    return nested_start, nested_end, nested_term
  end
  if plain_start then
    return plain_start, plain_end, plain_term
  end
  return nil
end

-- Rebuild one run with its markers resolved, or nil when it holds none, which
-- is how an untouched run keeps its own inlines rather than a copy of them.
local function resolve_run(text)
  local acc = {}
  local pos = 1
  local found = false

  while true do
    local first, last, term = find_marker(text, pos)
    if not first then break end
    found = true
    push_text(acc, text:sub(pos, first - 1))
    local command = index_command(term)
    if command ~= "" then
      acc[#acc + 1] = pandoc.RawInline("latex", command)
    end
    pos = last + 1
  end

  if not found then return nil end
  push_text(acc, text:sub(pos))
  return acc
end

-- Pandoc filter for every list of inlines
function Inlines(inlines)
  local out = {}
  local run = {}
  local text = {}

  local function flush()
    if #run == 0 then return end
    local resolved = resolve_run(table.concat(text))
    for _, inline in ipairs(resolved or run) do
      out[#out + 1] = inline
    end
    run, text = {}, {}
  end

  for _, inline in ipairs(inlines) do
    local piece = run_text(inline)
    if piece then
      run[#run + 1] = inline
      text[#text + 1] = piece
    else
      flush()
      out[#out + 1] = inline
    end
  end
  flush()

  return out
end

-- Process RawInline elements that might contain markers. Their text is one
-- opaque string rather than a run of inlines, so it is resolved whole.
function RawInline(elem)
  if elem.format ~= "markdown" and elem.format ~= "html" then
    return elem
  end

  local new_text = elem.text:gsub(INDEX_PATTERN_NESTED, index_command)
  new_text = new_text:gsub(INDEX_PATTERN, index_command)

  if new_text == elem.text then return elem end
  if new_text == "" then return {} end
  if is_latex_output() then
    return pandoc.RawInline("latex", new_text)
  end
  return pandoc.RawInline(elem.format, new_text)
end

-- Return the filter. RawInline runs first within the pass, on the elements; the
-- run walker then sees a resolved RawInline and passes it through untouched, so
-- no marker is processed twice.
return {
  { RawInline = RawInline, Inlines = Inlines }
}
