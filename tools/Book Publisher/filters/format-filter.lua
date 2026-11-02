--[[
  Format Filter for Pandoc
  
  Processes HTML comments as formatting directives for book publishing.
  Enables clean markdown files while supporting format-specific output.
  
  Syntax in markdown:
    <!-- format: directive -->
    <!-- format: directive=value -->
    <!-- format: directive1, directive2=value -->
    <!-- /format -->
  
  Supported directives:
    page-style=empty|plain|fancy   - Set page style (LaTeX only)
    font-size=scriptsize|small|normalsize|large|Large|LARGE|huge|Huge
    new-page                       - Force page break
    no-clearpage                   - Suppress the automatic page break before the next heading (LaTeX only)
    centered                       - Center content
    vspace=value                   - Add vertical space (e.g., vspace=0.5in)
    vfill                          - Vertical fill
    linespacing=value              - Set line spacing (e.g., linespacing=1.0)
    needspace=value                - Require minimum space before page break (e.g., needspace=3in)
    
  Special directives:
    <!-- toc-start -->                      - Begin a tight TOC block (flush left, no paragraph spacing)
    <!-- toc-end -->                        - End the tight TOC block
    <!-- toc-entry: Title, page_number -->  - TOC entry with leader dots
    <!-- toc-part: Part Title -->           - TOC part heading (bold)
    <!-- printindex -->                     - Accepted and dropped; the index has one home (see below)
    <!-- pagebreak -->                      - Force page break
    <!-- cleardoublepage -->                - Page break that resumes on the next odd page
    <!-- thumb-tab-start: label=TEXT, slot=N --> - Start thumb tab marker
    <!-- thumb-tab-end -->                  - End thumb tab marker
    <!-- br -->                             - Line break
    
  Auto-needspace (LaTeX only):
    Bold-only paragraphs followed by an image (with at most one intermediate
    text paragraph) automatically get \needspace{3in} injected before them.
    This prevents page breaks between bold sub-headings and their associated
    tables/charts. No manual markup needed.
    
  Image Processing:
    All images are automatically processed with DPI-aware sizing:
    - Target DPI: 300 (print standard)
    - Content width: 6.05 inches (for 8x10 book with margins)
    - Images are centered
    - Images exceeding content width are scaled down
    - Images smaller than content width display at natural 300 DPI size
    - Requires: sips (macOS) or ImageMagick identify command
    
  For LaTeX: Converts to appropriate LaTeX commands
  For EPUB/HTML: Converts to CSS classes/styles or removes cleanly
  
  Usage:
    pandoc input.md -o output.pdf --lua-filter=format-filter.lua
]]

-- Stack to track open format blocks for proper closing
local format_stack = {}

-- Check output format
local function is_latex_output()
  return FORMAT:match("latex") or FORMAT:match("pdf") or FORMAT:match("tex")
end

local function is_epub_output()
  return FORMAT:match("epub")
end

local function is_html_output()
  return FORMAT:match("html") or is_epub_output()
end

-- Parse format directive string into table of directives
local function parse_directives(directive_str)
  local directives = {}
  
  for part in directive_str:gmatch("[^,]+") do
    part = part:match("^%s*(.-)%s*$")
    
    local key, value = part:match("^([%w%-]+)=(.+)$")
    if key then
      directives[key] = value
    else
      directives[part] = true
    end
  end
  
  return directives
end

-- Generate LaTeX for opening format directives
local function latex_open_directives(directives)
  local commands = {}
  local tracked = {}
  
  -- Immediate commands (not tracked)
  if directives["page-style"] then
    table.insert(commands, "\\pagestyle{" .. directives["page-style"] .. "}")
  end
  
  if directives["new-page"] then
    table.insert(commands, "\\clearpage")
  end
  
  -- Suppress automatic clearpage from next heading
  if directives["no-clearpage"] then
    -- This tells LaTeX to not add clearpage before next title
    table.insert(commands, "\\makeatletter\\@afterindentfalse\\@afterheading\\makeatother")
  end
  
  if directives["needspace"] then
    table.insert(commands, "\\needspace{" .. directives["needspace"] .. "}")
  end
  
  if directives["vspace"] then
    table.insert(commands, "\\vspace{" .. directives["vspace"] .. "}")
  end
  
  if directives["vfill"] then
    table.insert(commands, "\\vfill")
  end
  
  -- Tracked commands (need closing)
  if directives["linespacing"] then
    local spacing = directives["linespacing"]
    table.insert(commands, "{\\setstretch{" .. spacing .. "}")
    tracked["linespacing"] = spacing
  end
  
  if directives["font-size"] then
    -- Map common sizes to LaTeX
    local size = directives["font-size"]
    table.insert(commands, "{\\" .. size)
    tracked["font-size"] = size
  end
  
  if directives["centered"] then
    table.insert(commands, "\\begin{center}")
    tracked["centered"] = true
  end
  
  return table.concat(commands, "\n"), tracked
end

-- Generate LaTeX for closing specific directives
-- Must close in reverse order of opening (LIFO)
local function latex_close_directives(tracked)
  local commands = {}
  
  -- Close center environment first (it was opened last)
  if tracked["centered"] then
    table.insert(commands, "\\end{center}")
  end
  
  -- Close font-size group
  if tracked["font-size"] then
    table.insert(commands, "}")
  end
  
  -- Close linespacing group (it was opened first)
  if tracked["linespacing"] then
    table.insert(commands, "}")
  end
  
  return table.concat(commands, "\n")
end

-- Generate HTML/CSS for opening format directives
-- Note: For EPUB, we avoid div wrappers that need explicit closing tags since
-- they cause section boundary issues when Pandoc generates section elements.
-- Immediate/self-closing styles are still applied.
local function html_open_directives(directives)
  local styles = {}
  local tracked = {}
  
  -- For EPUB: Skip all div wrappers that need closing tags
  -- They cause section boundary mismatches
  if is_epub_output() then
    -- Only handle immediate directives that don't need tracking
    if directives["vspace"] then
      local value = directives["vspace"]
      -- Use margin on next element instead of wrapper div
      return '<div style="margin-top: ' .. value .. '"></div>', {}
    end
    return "", {}
  end
  
  -- For non-EPUB HTML output, use full styling
  if directives["font-size"] then
    local size_map = {
      scriptsize = "0.6em",
      small = "0.875em",
      normalsize = "1em",
      large = "1.125em",
      Large = "1.25em",
      LARGE = "1.5em",
      huge = "1.75em",
      Huge = "2em"
    }
    local size = directives["font-size"]
    if size_map[size] then
      table.insert(styles, "font-size: " .. size_map[size])
      tracked["font-size"] = true
    end
  end
  
  if directives["centered"] then
    table.insert(styles, "text-align: center")
    tracked["centered"] = true
  end
  
  if directives["vspace"] then
    local value = directives["vspace"]
    table.insert(styles, "margin-top: " .. value)
  end
  
  if #styles > 0 then
    return '<div style="' .. table.concat(styles, "; ") .. '">', tracked
  end
  
  return "", tracked
end

-- Generate HTML/CSS for closing format directives
local function html_close_directives(tracked)
  if tracked["font-size"] or tracked["centered"] then
    return '</div>'
  end
  return ""
end

-- Process RawBlock elements (where HTML comments appear)
function RawBlock(elem)
  if elem.format == "html" then
    -- Check for format directive: <!-- format: ... -->
    local directive_str = elem.text:match("<!%-%-%s*format:%s*(.-)%s*%-%->")
    
    if directive_str then
      local directives = parse_directives(directive_str)
      
      if is_latex_output() then
        local latex, tracked = latex_open_directives(directives)
        if next(tracked) then
          table.insert(format_stack, tracked)
        end
        if latex ~= "" then
          return pandoc.RawBlock("latex", latex)
        end
      elseif is_html_output() then
        local html, tracked = html_open_directives(directives)
        if next(tracked) then
          table.insert(format_stack, tracked)
        end
        if html ~= "" then
          return pandoc.RawBlock("html", html)
        end
      end
      
      return {}
    end
    
    -- Check for end format directive: <!-- /format -->
    if elem.text:match("<!%-%-%s*/format%s*%-%->") then
      local tracked = table.remove(format_stack)
      
      if tracked then
        if is_latex_output() then
          local latex = latex_close_directives(tracked)
          if latex ~= "" then
            return pandoc.RawBlock("latex", latex)
          end
        elseif is_html_output() then
          local html = html_close_directives(tracked)
          if html ~= "" then
            return pandoc.RawBlock("html", html)
          end
        end
      end
      
      return {}
    end
    
    -- Check for toc-start: <!-- toc-start --> - begins tight TOC block
    if elem.text:match("<!%-%-%s*toc%-start%s*%-%->") then
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\begin{flushleft}\\setlength{\\parskip}{0pt}\\setlength{\\parindent}{0pt}")
      elseif is_html_output() then
        return pandoc.RawBlock("html", '<div class="toc-block" style="line-height: 1.4;">')
      end
      return {}
    end
    
    -- Check for toc-end: <!-- toc-end --> - ends tight TOC block
    if elem.text:match("<!%-%-%s*toc%-end%s*%-%->") then
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\end{flushleft}")
      elseif is_html_output() then
        return pandoc.RawBlock("html", '</div>')
      end
      return {}
    end
    
    -- Check for TOC entry with page number: <!-- toc-entry: Title, page -->
    local toc_title, toc_page = elem.text:match("<!%-%-%s*toc%-entry:%s*(.-),%s*(%d+)%s*%-%->")
    if toc_title then
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\hspace{0.25in}" .. toc_title .. " \\dotfill " .. toc_page .. "\\par")
      elseif is_html_output() then
        return pandoc.RawBlock("html", '<div class="toc-entry" style="padding-left: 0.25in;">' .. toc_title .. '<span style="float:right;">' .. toc_page .. '</span></div>')
      end
      return pandoc.Para(pandoc.Str("  " .. toc_title))
    end
    
    -- Check for TOC entry without page number: <!-- toc-entry: Title -->
    -- For EPUB: generates a hyperlink to the section
    -- For PDF: shows the title only; page numbers are resolved by the LaTeX passes
    local toc_title_nopg = elem.text:match("<!%-%-%s*toc%-entry:%s*([^,>]+)%s*%-%->")
    if toc_title_nopg then
      toc_title_nopg = toc_title_nopg:match("^%s*(.-)%s*$") -- trim
      if is_latex_output() then
        -- For LaTeX/PDF, show the title with no page number here
        return pandoc.RawBlock("latex", "\\hspace{0.25in}" .. toc_title_nopg .. "\\par")
      elseif is_html_output() then
        -- For EPUB/HTML, just show the title (Pandoc will generate TOC with links)
        return pandoc.RawBlock("html", '<div class="toc-entry" style="padding-left: 0.25in;">' .. toc_title_nopg .. '</div>')
      end
      return pandoc.Para(pandoc.Str("  " .. toc_title_nopg))
    end
    
    -- Check for TOC part heading with page: <!-- toc-part: Part Title, page -->
    local toc_part, part_page = elem.text:match("<!%-%-%s*toc%-part:%s*(.-),%s*(%d+)%s*%-%->")
    if toc_part then
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\vspace{0.06in}\\textbf{" .. toc_part .. "} \\dotfill " .. part_page .. "\\par")
      elseif is_html_output() then
        return pandoc.RawBlock("html", '<div class="toc-part" style="margin-top: 0.06in;"><strong>' .. toc_part .. '</strong><span style="float:right;">' .. part_page .. '</span></div>')
      end
      return pandoc.Para(pandoc.Strong(pandoc.Str(toc_part)))
    end
    
    -- Check for TOC part heading without page: <!-- toc-part: Part Title -->
    local toc_part_nopg = elem.text:match("<!%-%-%s*toc%-part:%s*([^,>]+)%s*%-%->")
    if toc_part_nopg then
      toc_part_nopg = toc_part_nopg:match("^%s*(.-)%s*$") -- trim
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\vspace{0.06in}\\textbf{" .. toc_part_nopg .. "}\\par")
      elseif is_html_output() then
        return pandoc.RawBlock("html", '<div class="toc-part" style="margin-top: 0.06in;"><strong>' .. toc_part_nopg .. '</strong></div>')
      end
      return pandoc.Para(pandoc.Strong(pandoc.Str(toc_part_nopg)))
    end
    
    -- Check for printindex: <!-- printindex -->
    -- Dropped in every format, never emitted. The index has one home: the print
    -- template places it after the body, with its page break and its table of
    -- contents entry, whenever the config enables it. Emitting \printindex here
    -- as well printed the index twice. The directive stays recognized so that a
    -- book whose source still carries it builds, and drops cleanly.
    if elem.text:match("<!%-%-%s*printindex%s*%-%->") then
      return {}
    end
    
    -- Check for simple page break: <!-- pagebreak -->
    if elem.text:match("<!%-%-%s*pagebreak%s*%-%->") then
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\clearpage")
      elseif is_html_output() then
        return pandoc.RawBlock("html", '<div style="page-break-after: always;"></div>')
      end
      return {}
    end
    
    -- Check for double page break (start on odd page): <!-- cleardoublepage -->
    if elem.text:match("<!%-%-%s*cleardoublepage%s*%-%->") then
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\cleardoublepage")
      elseif is_html_output() then
        return pandoc.RawBlock("html", '<div style="page-break-after: always;"></div>')
      end
      return {}
    end
    
    -- Check for thumb tab start: <!-- thumb-tab-start: label=TEXT, slot=N -->
    local thumb_params = elem.text:match("<!%-%-%s*thumb%-tab%-start:%s*(.-)%s*%-%->")
    if thumb_params then
      local label = thumb_params:match("label=([^,]+)") or ""
      local slot = thumb_params:match("slot=(%d+)") or "1"
      label = label:match("^%s*(.-)%s*$") -- trim
      
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\thumbtabstart{" .. slot .. "}{" .. label .. "}")
      end
      -- For EPUB/HTML, thumb tabs don't apply
      return {}
    end
    
    -- Check for thumb tab end: <!-- thumb-tab-end -->
    if elem.text:match("<!%-%-%s*thumb%-tab%-end%s*%-%->") then
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\thumbtabend")
      end
      return {}
    end
    
    -- Check for line break: <!-- br -->
    if elem.text:match("<!%-%-%s*br%s*%-%->") then
      if is_latex_output() then
        return pandoc.RawBlock("latex", "\\\\")
      elseif is_html_output() then
        return pandoc.RawBlock("html", '<br />')
      end
      return {}
    end
  end
  
  return elem
end

-- Process RawInline elements (inline HTML comments)
function RawInline(elem)
  if elem.format == "html" then
    -- Check for inline line break: <!-- br -->
    if elem.text:match("<!%-%-%s*br%s*%-%->") then
      if is_latex_output() then
        return pandoc.RawInline("latex", "\\\\")
      elseif is_html_output() then
        return pandoc.RawInline("html", '<br />')
      end
      return {}
    end
  end
  return elem
end

-- Process HorizontalRule elements (*** or --- in markdown) for consistent spacing
function HorizontalRule(elem)
  if is_latex_output() then
    -- Use custom thematicbreak command for consistent spacing
    return pandoc.RawBlock("latex", "\\thematicbreak")
  elseif is_html_output() then
    -- Use styled hr for HTML/EPUB (self-closing for XHTML compatibility)
    return pandoc.RawBlock("html", '<hr style="margin: 1.5em auto; width: 30%; border: none; border-top: 1px solid #ccc;" />')
  end
  return elem
end

--[[
  DPI-aware Image Processing
  
  Images are rendered at their natural size based on 300 DPI,
  capped at content width if they exceed it. All images are centered.
  
  Configuration:
    TARGET_DPI = 300 (print standard)
    CONTENT_WIDTH_INCHES = derived from metadata "content-width" (set by publish.js)
                           Falls back to 6.05 for 8x10 book with margins
]]

local TARGET_DPI = 300
local CONTENT_WIDTH_INCHES = 6.05  -- default; overridden by metadata if available

-- Read content-width from document metadata (set by publish.js via --metadata)
function Meta(meta)
  if meta["content-width"] then
    local val = pandoc.utils.stringify(meta["content-width"])
    local num = tonumber(val)
    if num and num > 0 then
      CONTENT_WIDTH_INCHES = num
    end
  end
end

-- Get image dimensions using available tools
-- Tries: sips (macOS), identify (ImageMagick), file command
local function get_image_dimensions(image_path)
  local width, height
  
  -- Method 1: macOS sips command (built-in on macOS)
  local handle = io.popen('sips -g pixelWidth -g pixelHeight "' .. image_path .. '" 2>/dev/null')
  if handle then
    local result = handle:read("*a")
    handle:close()
    
    if result and result ~= "" then
      width = result:match("pixelWidth:%s*(%d+)")
      height = result:match("pixelHeight:%s*(%d+)")
      if width and height then
        return tonumber(width), tonumber(height)
      end
    end
  end
  
  -- Method 2: ImageMagick identify command
  handle = io.popen('identify -format "%w %h" "' .. image_path .. '" 2>/dev/null')
  if handle then
    local result = handle:read("*a")
    handle:close()
    
    if result and result ~= "" then
      width, height = result:match("(%d+)%s+(%d+)")
      if width and height then
        return tonumber(width), tonumber(height)
      end
    end
  end
  
  -- Method 3: file command (less reliable fallback)
  handle = io.popen('file "' .. image_path .. '" 2>/dev/null')
  if handle then
    local result = handle:read("*a")
    handle:close()
    
    -- Try to parse dimensions from file output (format varies)
    width, height = result:match("(%d+)%s*x%s*(%d+)")
    if width and height then
      return tonumber(width), tonumber(height)
    end
  end
  
  return nil, nil
end

-- Calculate physical width at target DPI, capped at content width
local function calculate_image_width(pixel_width)
  if not pixel_width then
    return nil
  end
  
  -- Calculate natural width at 300 DPI
  local natural_width = pixel_width / TARGET_DPI
  
  -- Cap at content width
  if natural_width > CONTENT_WIDTH_INCHES then
    return CONTENT_WIDTH_INCHES
  end
  
  return natural_width
end

-- Check if a file exists at the given path
local function file_exists(path)
  local f = io.open(path, "r")
  if f then
    f:close()
    return true
  end
  return false
end

-- Resolve image path against Pandoc's resource paths
-- Returns the first existing path, or the original src if none found
local function resolve_image_path(src)
  -- If it's already an absolute path and exists, use it
  if src:match("^/") and file_exists(src) then
    return src
  end
  
  -- Try each resource path
  if PANDOC_STATE and PANDOC_STATE.resource_path then
    for _, rpath in ipairs(PANDOC_STATE.resource_path) do
      local full_path = rpath .. "/" .. src
      if file_exists(full_path) then
        return full_path
      end
    end
  end
  
  -- Fallback: return original (will likely fail in get_image_dimensions)
  return src
end

-- Build centered image LaTeX (non-floating)
local function latex_image_width(width_inches)
  local rounded = string.format("%.2f", width_inches)
  -- Preserve existing sizing unless rounding would cross the text block's
  -- edge. Use the actual TeX line width even for widths below 0.01 inch.
  if tonumber(rounded) > CONTENT_WIDTH_INCHES then
    return "\\linewidth"
  end
  return rounded .. "in"
end

local function build_image_latex(src, width_inches)
  local latex = "\\begin{center}\n"
  
  if width_inches then
    latex = latex .. "\\includegraphics[width=" .. latex_image_width(width_inches) .. "]{" .. src .. "}\n"
  else
    latex = latex .. "\\includegraphics[width=\\linewidth,keepaspectratio]{" .. src .. "}\n"
  end
  
  latex = latex .. "\\end{center}"
  return latex
end

-- Process Para elements to handle standalone images without figure wrapper
-- This prevents Pandoc from wrapping images in floating figure environments
function Para(elem)
  -- Check if this paragraph contains only a single image
  if #elem.content == 1 and elem.content[1].t == "Image" then
    local img = elem.content[1]
    local src = img.src
    
    if is_latex_output() then
      local width_inches = nil
      
      -- Check for explicit width attribute
      if img.attributes and img.attributes.width then
        -- Use explicit width as-is
        local latex = "\\begin{center}\n"
        latex = latex .. "\\includegraphics[width=" .. img.attributes.width .. "]{" .. src .. "}\n"
        latex = latex .. "\\end{center}"
        return pandoc.RawBlock("latex", latex)
      end
      
      -- Calculate width from dimensions
      local image_path = resolve_image_path(src)
      local pixel_width, pixel_height = get_image_dimensions(image_path)
      width_inches = calculate_image_width(pixel_width)
      
      local latex = build_image_latex(src, width_inches)
      return pandoc.RawBlock("latex", latex)
      
    elseif is_html_output() then
      local style = "display: block; margin: 1em auto; max-width: 100%;"
      
      local image_path = resolve_image_path(src)
      local pixel_width, pixel_height = get_image_dimensions(image_path)
      local width_inches = calculate_image_width(pixel_width)
      
      if width_inches then
        style = style .. " width: " .. string.format("%.2fin", width_inches) .. ";"
      end
      
      local html = '<img src="' .. src .. '" style="' .. style .. '"'
      if img.caption and #img.caption > 0 then
        local alt = pandoc.utils.stringify(img.caption)
        html = html .. ' alt="' .. alt .. '"'
      end
      html = html .. ' />'
      return pandoc.RawBlock("html", html)
    end
  end
  
  return elem
end

-- Process Image elements for DPI-aware sizing (fallback for non-standalone images)
function Image(elem)
  local src = elem.src
  
  -- Skip if already has explicit width attribute
  if elem.attributes and elem.attributes.width then
    if is_latex_output() then
      local latex = "\\includegraphics[width=" .. elem.attributes.width .. "]{" .. src .. "}"
      return pandoc.RawInline("latex", latex)
    end
    return elem
  end
  
  -- Resolve the image path against resource paths for dimension lookup
  local image_path = resolve_image_path(src)
  
  -- Get pixel dimensions
  local pixel_width, pixel_height = get_image_dimensions(image_path)
  
  -- Calculate appropriate width
  local width_inches = calculate_image_width(pixel_width)
  
  if is_latex_output() then
    local latex
    if width_inches then
      latex = "\\includegraphics[width=" .. latex_image_width(width_inches) .. "]{" .. src .. "}"
    else
      latex = "\\includegraphics[width=\\linewidth,keepaspectratio]{" .. src .. "}"
    end
    return pandoc.RawInline("latex", latex)
    
  elseif is_html_output() then
    local style = "max-width: 100%;"
    if width_inches then
      style = style .. " width: " .. string.format("%.2fin", width_inches) .. ";"
    end
    
    local html = '<img src="' .. src .. '" style="' .. style .. '"'
    if elem.caption and #elem.caption > 0 then
      local alt = pandoc.utils.stringify(elem.caption)
      html = html .. ' alt="' .. alt .. '"'
    end
    html = html .. ' />'
    return pandoc.RawInline("html", html)
  end
  
  return elem
end

--[[
  Auto-needspace: Prevent page breaks between bold sub-headings and their tables
  
  Detects the pattern of a bold-only paragraph followed by an image (with at most
  one intermediate text paragraph between them) and injects \needspace to keep
  the heading and table together on the same page.
  
  This handles the common book pattern:
    **Heading**                    <- bold-only paragraph
    Optional one-line description  <- optional intermediate paragraph
    ![Table](path/to/image.png)   <- image paragraph
]]

-- Check if a Para contains only bold (Strong) text
local function is_bold_only_para(block)
  if block.t ~= "Para" then return false end
  local content = block.content
  if #content == 0 then return false end
  -- Single Strong element (e.g., **Heading Text**)
  if #content == 1 and content[1].t == "Strong" then return true end
  return false
end

-- Check if a Para contains only a single Image
local function is_image_para(block)
  if block.t ~= "Para" then return false end
  if #block.content == 1 and block.content[1].t == "Image" then return true end
  return false
end

-- Process block lists to auto-inject needspace before bold heading + image pairs
function Blocks(blocks)
  if not is_latex_output() then
    return blocks
  end
  
  local new_blocks = {}
  local i = 1
  
  while i <= #blocks do
    local block = blocks[i]
    
    if is_bold_only_para(block) then
      -- Look ahead up to 2 blocks for an image paragraph
      local has_image_nearby = false
      for lookahead = 1, 2 do
        local next_block = blocks[i + lookahead]
        if next_block then
          if is_image_para(next_block) then
            has_image_nearby = true
            break
          elseif next_block.t ~= "Para" then
            -- Stop looking if we hit a non-paragraph (list, heading, etc.)
            break
          end
        end
      end
      
      if has_image_nearby then
        table.insert(new_blocks, pandoc.RawBlock("latex", "\\needspace{3in}"))
      end
    end
    
    table.insert(new_blocks, block)
    i = i + 1
  end
  
  return new_blocks
end

-- Return the filter
-- Meta must come FIRST to read content-width before images are processed
-- Blocks must come before Para to detect bold+image patterns before Para converts images to RawBlocks
-- Para must come before Image to handle standalone images without figure wrapper
return {
  { Meta = Meta },
  { Blocks = Blocks },
  { RawBlock = RawBlock },
  { RawInline = RawInline },
  { HorizontalRule = HorizontalRule },
  { Para = Para },
  { Image = Image }
}
