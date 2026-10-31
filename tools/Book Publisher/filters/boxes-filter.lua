-- Opt-in fenced-div boxes. publish.js validates and supplies the class/style map.
-- Kept separate from format-filter so EPUB retains its existing processing.
local boxes = {}

-- TeX does not accept scientific notation in dimensions or gray factors.
-- Eight decimal places are already finer than a TeX scaled point.
local function decimal(value)
  return string.format('%.8f', value):gsub('0+$', ''):gsub('%.$', '')
end

local function Meta(meta)
  if meta['book-boxes'] then
    boxes = pandoc.json.decode(pandoc.utils.stringify(meta['book-boxes']))
  end
end

local function box_for(elem)
  -- The first configured class in manuscript order wins; unknown classes are
  -- untouched, including all their identifiers, attributes and nested content.
  for _, class in ipairs(elem.classes) do
    if boxes[class] then return boxes[class] end
  end
end

local function Div(elem)
  local box = box_for(elem)
  if not box then return nil end

  if FORMAT:match('latex') then
    -- mdframed cannot split an inner frame across pages. Refuse that placement
    -- rather than silently overflowing or losing a long nested box's content.
    pandoc.Pandoc(elem.content):walk({ Div = function(child)
      if box_for(child) then
        error('Nested configured print boxes are not supported; close the outer box before starting another boxed class.')
      end
    end })
    local style = box.print
    -- Book headings normally start new pages. Within a box they are local bold
    -- labels, with their link targets retained, rather than chapter openers.
    elem = elem:walk({ Header = function(header)
      return pandoc.Para({ pandoc.Span({ pandoc.Strong(header.content) }, header.attr) })
    end })
    elem.content:insert(1, pandoc.RawBlock('latex', string.format(
      '\\begin{bookpublisherbox}{%s}{%s}{%s}{%s}',
      decimal(style.background_gray), decimal(style.border_gray),
      decimal(style.border_width), decimal(style.padding))))
    elem.content:insert(pandoc.RawBlock('latex', '\\end{bookpublisherbox}'))
    return elem
  elseif FORMAT:match('epub') or FORMAT:match('html') then
    local style = box.epub
    local css = string.format(
      'background-color: %s; border: %spx solid %s; padding: %sem; margin: 1em 0;',
      style.background, decimal(style.border_width), style.border_color, decimal(style.padding))
    local existing = elem.attributes.style
    elem.attributes.style = existing and (existing .. '; ' .. css) or css
    return elem
  end
end

return { { Meta = Meta }, { Div = Div } }
