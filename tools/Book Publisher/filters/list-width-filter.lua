-- Measure each ordered list at its own enumerate level. Only ordered ancestors
-- count: a surrounding bullet list does not consume an enumerate counter.
local counters = {
  Decimal = '\\arabic*', DefaultStyle = '\\arabic*',
  LowerAlpha = '\\alph*', UpperAlpha = '\\Alph*',
  LowerRoman = '\\roman*', UpperRoman = '\\Roman*'
}

local function roman_length(value)
  local length = 0
  for _, pair in ipairs({{1000, 1}, {900, 2}, {500, 1}, {400, 2},
      {100, 1}, {90, 2}, {50, 1}, {40, 2}, {10, 1}, {9, 2},
      {5, 1}, {4, 2}, {1, 1}}) do
    length = length + math.floor(value / pair[1]) * pair[2]
    value = value % pair[1]
  end
  return length
end

local function size_lists(blocks, depth)
  return pandoc.Blocks(blocks):walk({
    traverse = 'topdown',
    OrderedList = function(list)
      local level = depth + 1
      for i, item in ipairs(list.content) do
        list.content[i] = size_lists(item, level)
      end
      local last = list.start + #list.content - 1
      local style = list.style
      local counter = counters[style]
      -- Preserve the existing indent for decimal lists ending at 9 or below.
      if not counter or #list.content == 0 or
          ((style == 'Decimal' or style == 'DefaultStyle') and last <= 9) then
        return list, false
      end
      local widest = last
      if style == 'LowerRoman' or style == 'UpperRoman' then
        for value = list.start, last do
          if roman_length(value) > roman_length(widest) then widest = value end
        end
      end
      local label = counter .. '.'
      if list.delimiter == 'OneParen' then label = counter .. ')' end
      if list.delimiter == 'TwoParens' then label = '(' .. counter .. ')' end
      -- Pandoc defines the label after begin{enumerate}; supply it here too so
      -- enumitem measures the actual style and delimiter before that begins.
      return {
        pandoc.RawBlock('latex', '\\begingroup\\setlist[enumerate,' .. level ..
          ']{label=' .. label .. ',widest*=' .. widest .. '}'),
        list,
        pandoc.RawBlock('latex', '\\endgroup')
      }, false
    end
  })
end

function Pandoc(doc)
  doc.blocks = size_lists(doc.blocks, 0)
  return doc
end
