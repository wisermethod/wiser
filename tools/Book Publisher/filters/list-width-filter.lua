-- Let enumitem size each ordered list for its own final counter. The group
-- confines the measurement to this list, including nested and restarted lists.
-- Single-digit lists retain the template's existing indent.
function OrderedList(list)
  local last = list.start + #list.content - 1
  if last <= 9 then return nil end
  return {
    pandoc.RawBlock('latex', '\\begingroup\\setlist[enumerate]{widest*=' .. last .. '}'),
    list,
    pandoc.RawBlock('latex', '\\endgroup')
  }
end
