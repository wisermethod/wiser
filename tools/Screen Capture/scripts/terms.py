"""Text matching in memory. Matches carry offsets and numbered classes, never text."""
import re

# Deliberately loose, as the proof was: OCR confuses @ and the punctuation.
ADDRESS = re.compile(r"[A-Za-z0-9._%+|\-]+\s?[@©®]\s?[A-Za-z0-9|\-]+(?:\s?[.,]\s?[A-Za-z0-9|\-]+)+")
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
        found = [(m.start(), m.end(), "address-shaped") for m in ADDRESS.finditer(text)]
        # Also find address-shaped runs through arbitrary OCR whitespace.
        for m in ADDRESS.finditer(compact):
            lo, hi = positions[m.start()], positions[m.end() - 1] + 1
            # Prefer the loose pattern's own run where it already found one.
            # Removing all spaces must not absorb the surrounding sentence.
            if not any(a < hi and lo < b for a, b, label in found):
                found.append((lo, hi, "address-shaped"))
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
