-- Opt-in print Parts. Work on parsed, document-level headings so examples in
-- code, quotes and lists cannot start a Part. EPUB keeps the source hierarchy:
-- native # Part / ## Chapter headings already supply its nested navigation.
function Pandoc(doc)
  local prefix = pandoc.utils.stringify(doc.meta['parts-prefix'])
  local in_part = false
  for i, block in ipairs(doc.blocks) do
    if block.t == 'Header' then
      if block.level == 1 then
        local title = pandoc.utils.stringify(block.content)
        in_part = title:sub(1, #prefix) == prefix
        if in_part then
          -- Let Pandoc escape TeX and retain inline emphasis in the title.
          local latex = pandoc.write(pandoc.Pandoc({pandoc.Plain(block.content)}), 'latex')
            :gsub('%s+$', '')
          -- Ask the writer to escape the identifier. Rendering an empty,
          -- unlisted Part lets us keep its anchors without parsing a title's
          -- nested or TeX-escaped braces, or adding an automatic contents entry.
          local anchor_heading = pandoc.Header(1, {},
            pandoc.Attr(block.identifier, {'unnumbered', 'unlisted'}))
          local anchor = pandoc.write(pandoc.Pandoc({anchor_heading}), 'latex',
            {top_level_division = 'part'}):gsub('\\part%*{}', ''):gsub('%s+$', '')
          -- The contents write must run on the Part title page, before
          -- \part* ships it out. The identifier belongs on that page too.
          doc.blocks[i] = pandoc.RawBlock('latex', '\\part*{' .. latex .. anchor ..
            '\\addcontentsline{toc}{part}{' .. latex .. '}}')
        end
      elseif in_part then
        block.level = block.level - 1
        doc.blocks[i] = block
      end
    end
  end
  return doc
end
