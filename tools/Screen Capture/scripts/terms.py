"""Text matching in memory. Matches carry offsets and numbered classes, never text."""
import re

# Deliberately loose, as the proof was: OCR confuses @ and the punctuation, and may put a space around either.
# Never a line break: OCR puts separate blocks of a screen on separate lines.
# The second form is an address a page shortened, "name@domain" with its ending cut off. It takes a real "@" with no
# space around it and the cut-off mark after it: an ellipsis, two dots or more, or one dot ending the line, which is
# how OCR reads an ellipsis. A bare line end is not a mark: OCR puts each block of a screen on its own line, so
# letters it runs into a misread "@" end lines too. So a prompt such as "dev@mini:~$", a glyph OCR misreads as "©"
# between two words, and that noise are none of them an address.
ADDRESS = re.compile(r"[A-Za-z0-9._%+|\-]+[ \t]?[@©®][ \t]?[A-Za-z0-9|\-]+(?:[ \t]?[.,][ \t]?[A-Za-z0-9|\-]+)+"
                     r"|(?<![A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]{2,}(?=\.?\u2026|\.{2,}|\.[ \t]*(?:\n|$))")
FOLD = str.maketrans({"0": "o", "1": "l", "|": "l"})


def folded(text):
    chars, positions = [], []
    for i, ch in enumerate(text):
        if not ch.isspace():
            for c in ch.casefold().translate(FOLD):
                chars.append(c)
                positions.append(i)
    return "".join(chars), positions


def word(ch):
    return ch.isalnum() or ch == "_" or ch == "|"


class Matcher:
    def __init__(self, terms=()):
        self.rules = []
        for number, term in enumerate(terms, 1):
            address = ADDRESS.fullmatch(re.sub(r"\s+", "", term))
            self._add(term, "term %d whole" % number, not bool(address))
            if address:
                local, domain = re.split(r"[@©®]", re.sub(r"\s+", "", term), maxsplit=1)
                for fragment in (local, domain, "@" + re.split(r"[.,]", domain)[0]):
                    self._add(fragment, "term %d fragment" % number, False)
            else:
                for part in term.split():
                    if len(part) >= 4:
                        self._add(part, "term %d part" % number, True)

    def _add(self, value, label, edges):
        value = folded(value)[0]
        if value:
            self.rules.append((value, label, edges))

    def matches(self, text):
        compact, positions = folded(text)
        # An unknown address is matched on the text as read, whose loose pattern already allows one space around
        # "@" and each dot. Matching it with the whitespace removed joins words OCR read on separate lines to a stray
        # "@" or "©", and a clean frame fails. Declared terms below are specific enough to match with it removed.
        found = [(m.start(), m.end(), "address-shaped") for m in ADDRESS.finditer(text)]
        for needle, label, edges in self.rules:
            start = 0
            while True:
                at = compact.find(needle, start)
                if at < 0:
                    break
                end = at + len(needle)
                lo, hi = positions[at], positions[end - 1] + 1
                if not edges or ((lo == 0 or not word(text[lo - 1])) and
                                 (hi == len(text) or not word(text[hi]))):
                    found.append((lo, hi, label))
                start = at + 1
        return sorted(set(found))
