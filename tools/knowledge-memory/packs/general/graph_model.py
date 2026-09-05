"""The general extraction pack: the types the model may extract, and nothing else.

This module is loaded by tools/knowledge-memory/scripts/knowledge_memory.py after
the dependency check, so it may import Cognee. It is passed to remember() as
graph_model, which routes it to cognify(), where it constrains WHAT the model
extracts before generation. Canonical NAMES are a separate concern and belong to
ontology.ttl and to the set's canon.md.

Eight types on purpose. A pack with eighty types hands the model an entity soup.
Source, Chunk, Episode, and ReviewItem are bookkeeping the tool creates itself and
are deliberately absent here: the model never mints them.

Status vocabulary, on every Entity and Idea: Candidate (default for anything new),
Canonical (accepted; only a human decision, applied by the tool, sets it), Alias (a surface
form pointing at a Canonical; never a second node), Stale, Rejected.

TODO (Solve): confirm that cognee 1.5.4 honours the ``identity_fields`` key in
``metadata``; ``index_fields`` is documented, ``identity_fields`` is what the source
prompt claimed and is unverified. If it is not honoured, identity is enforced by the
tool's own normalized-name rule and this comment is replaced by that fact.
"""

from typing import List, Literal, Optional

from cognee.infrastructure.engine import DataPoint

Status = Literal["Candidate", "Canonical", "Alias", "Stale", "Rejected"]
IdeaRelation = Literal[
    "EXEMPLIFIES",
    "DEPENDS_ON",
    "CONTRADICTS",
    "SPECIALIZES",
    "DECIDED_IN",
    "APPLIES_TO",
]


class Entity(DataPoint):
    """A named thing in the corpus: a person, an organization, a work, a place, a term of art."""

    name: str
    entity_type: str  # person | organization | work | place | term | other
    aliases: List[str] = []
    summary: str = ""
    status: Status = "Candidate"
    quote: str  # verbatim, 40 words at most, from the chunk; no quote, no node
    metadata: dict = {"index_fields": ["name"], "identity_fields": ["entity_type", "name"]}


class Idea(DataPoint):
    """A reusable claim, method, principle, pattern, or decision theme, named as a stable noun phrase."""

    name: str
    definition: str  # one or two sentences
    domain: str = ""
    status: Status = "Candidate"
    quote: str  # verbatim, 40 words at most
    metadata: dict = {"index_fields": ["name", "definition"], "identity_fields": ["name"]}


class IdeaLink(DataPoint):
    """A typed edge from one Idea to an Idea or Entity. Untyped links are not extracted."""

    source_name: str
    relation: IdeaRelation
    target_name: str
    quote: str
    metadata: dict = {"index_fields": ["source_name", "target_name"]}


class Fact(DataPoint):
    """One atomic claim: subject, predicate, object, with its validity window where the source dates it."""

    subject: str
    predicate: str
    object: str
    valid_from: Optional[str] = None  # YYYY-MM-DD only when the source dates the claim
    valid_to: Optional[str] = None  # only when the source ends it
    confidence: float = 0.5
    quote: str
    metadata: dict = {"index_fields": ["subject", "predicate", "object"]}


class Decision(DataPoint):
    """A decision the corpus records as made: what was decided, by whom if stated, and when if stated."""

    summary: str
    decided_by: str = ""
    decided_on: Optional[str] = None
    quote: str
    metadata: dict = {"index_fields": ["summary"]}


class OpenQuestion(DataPoint):
    """Something the corpus raises and does not settle, or something the extractor could not place in a type above."""

    question: str
    quote: str
    metadata: dict = {"index_fields": ["question"]}


class GeneralExtraction(DataPoint):
    """What one chunk yields. This is the top-level model passed as graph_model."""

    entities: List[Entity] = []
    ideas: List[Idea] = []
    idea_links: List[IdeaLink] = []
    facts: List[Fact] = []
    decisions: List[Decision] = []
    open_questions: List[OpenQuestion] = []
    metadata: dict = {"index_fields": []}


GRAPH_MODEL = GeneralExtraction
PROTECTED_TYPES = ("person", "organization", "Idea")  # never auto-merged on weak similarity
