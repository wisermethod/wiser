"""Rank stored Passage texts: lexical, vector, and the merges of the two.

This changes only which candidates are offered. No other number moves: the same
store, the same top-k, the same evidence budget, the same everything downstream.
The lexical index is built in this process from the same `Passage.text` column
the embedder reads, so no weight is loaded that recall did not already load, and
nothing is written.

`hybrid` interleaves the two rankings; it does not score them by agreement.
Reciprocal rank fusion rewards passages both rankers put high, which is right
when two rankers are noisy estimates of one thing. These two are not: the whole
case for a hybrid is that they are good at different things, so the passages
worth recovering are exactly the ones only one ranker can see, and a consensus
merge discards them by construction. `hybrid-rrf` is kept so the two can be
compared rather than argued about. The 1:1 alternation is the unforced ratio; a
2:1 split would be a setting chosen by looking at an answer.

No stoplist: BM25 idf already discounts a term that appears in most passages,
and a hand-authored word list is a setting nobody could check. No stemming.
k1, b and the fusion constant are the conventional 1.5, 0.75 and 60.

Every ordering breaks ties on the passage index, so two passages with identical
scores always come back in the same order and a rerun is the same list.
"""
import math
import re

# The conventional BM25 parameters.
K1 = 1.5
B = 0.75
# The conventional reciprocal-rank-fusion constant.
RRF_K = 60

MODES = ('cosine', 'lexical', 'hybrid', 'hybrid-rrf', 'multi', 'multi-hybrid')
# The mode the callers name. See the module docstring for why it is the interleave
# and not the consensus score.
LIVE = 'hybrid'

# A clause split, used only by the multi-query modes. Sentence ends, semicolons, colons,
# and the coordinations a two-part question uses to join its asks.
_SPLIT = re.compile(
    r'(?:(?<=[.?!])\s+|;\s+|:\s+|,\s+and\s+|,\s+but\s+|,\s+or\s+'
    r'|\s+and\s+what\s+|\s+and\s+did\s+|\s+and\s+how\s+)')
_MIN_PART_TOKENS = 3


def tokens(text):
    """Lowercase alphanumeric runs of two characters or more. No stoplist, no stemming."""
    return [w for w in re.findall(r'[a-z0-9]+', str(text or '').lower()) if len(w) > 1]


def split_query(question):
    """The whole question, then each clause long enough to be a query on its own.

    The whole question is always first and always present, so a multi-query mode can
    only add candidates to what the single query would have proposed, never replace
    them. A part shorter than `_MIN_PART_TOKENS` tokens is dropped: "What are they?"
    is not a query.

    Duplication is judged on the token list, not on the string. A question with no
    split point at all yields one part whose only difference from the whole question
    is the trailing question mark, and running the same query twice under a different
    spelling would double its weight in every merge for nothing.
    """
    out = [question]
    seen = [tokens(question)]
    for part in _SPLIT.split(question):
        part = part.strip(' ,.?!')
        toks = tokens(part)
        if part and len(toks) >= _MIN_PART_TOKENS and toks not in seen:
            seen.append(toks)
            out.append(part)
    return out


class Lexical:
    """A BM25 index over passage texts, built in the process from the store.

    Held as an object rather than a function because the document frequencies and the
    average length are properties of the corpus and are computed once per recall, while
    a multi-query mode scores several queries against them.
    """

    def __init__(self, texts):
        self.docs = [tokens(t) for t in texts]
        self.n = len(self.docs)
        if not self.n:
            raise ValueError('lexical index over an empty corpus')
        self.avgdl = sum(len(d) for d in self.docs) / self.n
        self.tf = []
        self.df = {}
        for d in self.docs:
            counts = {}
            for w in d:
                counts[w] = counts.get(w, 0) + 1
            self.tf.append(counts)
            for w in counts:
                self.df[w] = self.df.get(w, 0) + 1

    def idf(self, term):
        """The Lucene non-negative form, so no term can contribute a negative score."""
        df = self.df.get(term, 0)
        return math.log(1 + (self.n - df + 0.5) / (df + 0.5))

    def scores(self, query):
        """BM25 of every document against `query`, which is raw text or a token list.

        **Query-term frequency is counted, and that is a declared choice.** A term
        appearing twice in the question contributes its weight twice, which is what a
        boolean query over repeated terms does. The alternative, summing over the
        distinct query terms once each, is the classic Robertson form.

        It is declared because it is not free and because this file first made it by
        accident. **39 of the 48 ranked questions repeat a token**, mostly function
        words, and the two readings put a different top 15 in front of the chooser on
        **31 of those 48 rows**. The adversarial review of 2026-09-13 found it, because
        `_reference_bm25` had implemented the other reading and `control()` had been run
        only on queries with no repeated term, which hid the disagreement.

        **The result does not turn on it**, and that was measured rather than assumed:
        under the distinct-terms reading `hybrid` covers 34 of 46 rows against 34, with
        32 under the strict reading against 31, and reaches the same eight target rows.
        Both readings are therefore reported and this one is the one the run used.
        """
        qs = query if isinstance(query, list) else tokens(query)
        present = [w for w in qs if w in self.df]
        out = [0.0] * self.n
        if not present:
            return out
        weights = {w: self.idf(w) for w in set(present)}
        for i, counts in enumerate(self.tf):
            dl = len(self.docs[i])
            norm = K1 * (1 - B + B * dl / self.avgdl)
            total = 0.0
            for w in present:
                f = counts.get(w, 0)
                if f:
                    total += weights[w] * (f * (K1 + 1)) / (f + norm)
            out[i] = total
        return out


def order_of(scores):
    """Descending by score, ties broken by index, so the ordering is a function."""
    return sorted(range(len(scores)), key=lambda i: (-scores[i], i))


def rrf(orders, k=RRF_K):
    """Reciprocal rank fusion. Kept and measured; not the live merge."""
    if not orders:
        raise ValueError('rrf over no rankings')
    n = len(orders[0])
    fused = [0.0] * n
    for o in orders:
        if len(o) != n:
            raise ValueError('rankings of different lengths')
        for rank, i in enumerate(o, 1):
            fused[i] += 1.0 / (k + rank)
    return sorted(range(n), key=lambda i: (-fused[i], i))


def interleave(orders, limit):
    """Round robin over the rankings, skipping anything already taken.

    Each ranking is guaranteed its share of the slots, which is the whole point: a
    passage only one ranker can find is what this merge exists to keep.
    """
    if not orders:
        raise ValueError('interleave over no rankings')
    out, seen = [], set()
    depth = 0
    longest = max(len(o) for o in orders)
    while len(out) < limit and depth < longest:
        for o in orders:
            if depth < len(o):
                i = o[depth]
                if i not in seen:
                    seen.add(i)
                    out.append(i)
                    if len(out) >= limit:
                        break
        depth += 1
    return out


def rank(mode, question, cosine_of, lexical, limit):
    """The ranked passage indices for one row, best first, at most `limit` of them.

    `cosine_of(text)` returns the cosine score of every passage against that text. It
    is a callback rather than a matrix so this module never imports numpy, never
    touches the model, and can be self-tested without either.

    Returns (indices, detail) where `detail` maps a returned index to the rank it held
    in each contributing ranking, so a result carries on its face which ranker found
    each passage.
    """
    if mode not in MODES:
        raise ValueError('unknown ranking mode %r' % (mode,))
    parts = split_query(question) if mode in ('multi', 'multi-hybrid') else [question]

    vector = [order_of(cosine_of(p)) for p in parts]
    lex = ([order_of(lexical.scores(p)) for p in parts]
           if mode in ('lexical', 'hybrid', 'hybrid-rrf', 'multi-hybrid') else [])

    if mode == 'cosine':
        merged = vector[0][:limit]
    elif mode == 'lexical':
        merged = lex[0][:limit]
    elif mode == 'hybrid':
        merged = interleave([vector[0], lex[0]], limit)
    elif mode == 'hybrid-rrf':
        merged = rrf([vector[0], lex[0]])[:limit]
    elif mode == 'multi':
        merged = interleave(vector, limit)
    else:  # multi-hybrid
        paired = []
        for k, v in enumerate(vector):
            paired.append(v)
            if k < len(lex):
                paired.append(lex[k])
        merged = interleave(paired, limit)

    vpos = {i: r for r, i in enumerate(vector[0], 1)}
    lpos = {i: r for r, i in enumerate(lex[0], 1)} if lex else {}
    detail = {}
    for i in merged:
        d = {'vector_rank': vpos.get(i)}
        if lpos:
            d['lexical_rank'] = lpos.get(i)
        detail[i] = d
    return merged, detail
