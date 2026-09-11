"""Six extracted types plus the wrapper, per references/schemas.md section 2.

Status vocabulary: Candidate, Canonical, Alias, Stale, Rejected. Only applying a
human decision sets Canonical. The session reads this pack; the tool never imports
it. Source, Chunk, Episode and ReviewItem are bookkeeping, never extracted types.
"""

from typing import List, Literal, Optional

from dataclasses import dataclass, field

Status = Literal["Candidate", "Canonical", "Alias", "Stale", "Rejected"]
IdeaRelation = Literal[
    "EXEMPLIFIES",
    "DEPENDS_ON",
    "CONTRADICTS",
    "SPECIALIZES",
    "DECIDED_IN",
    "APPLIES_TO",
]


@dataclass
class Entity:
    """A named thing in the corpus: a person, an organization, a work, a place, a term of art."""

    name: str
    entity_type: str  # person | organization | work | place | term | other
    quote: str  # verbatim, 40 words at most, from the chunk; no quote, no node
    aliases: List[str] = field(default_factory=list)
    summary: str = ""
    status: Status = "Candidate"


@dataclass
class Idea:
    """A reusable claim, method, principle, pattern, or decision theme, named as a stable noun phrase."""

    name: str
    definition: str  # one or two sentences
    quote: str  # verbatim, 40 words at most
    domain: str = ""
    status: Status = "Candidate"


@dataclass
class IdeaLink:
    """A typed edge from one Idea to an Idea or Entity. Untyped links are not extracted."""

    source_name: str
    relation: IdeaRelation
    target_name: str
    quote: str


@dataclass
class Fact:
    """One atomic claim: subject, predicate, object, with its validity window where the source dates it."""

    subject: str
    predicate: str
    object: str
    quote: str
    valid_from: Optional[str] = None  # YYYY-MM-DD only when the source dates the claim
    valid_to: Optional[str] = None  # only when the source ends it
    confidence: float = 0.5


@dataclass
class Decision:
    """A decision the corpus records as made: what was decided, by whom if stated, and when if stated."""

    summary: str
    quote: str
    decided_by: str = ""
    decided_on: Optional[str] = None


@dataclass
class OpenQuestion:
    """Something the corpus raises and does not settle, or something the extractor could not place in a type above."""

    question: str
    quote: str


@dataclass
class GeneralExtraction:
    """The wrapper for the six arrays one chunk yields."""

    entities: List[Entity] = field(default_factory=list)
    ideas: List[Idea] = field(default_factory=list)
    idea_links: List[IdeaLink] = field(default_factory=list)
    facts: List[Fact] = field(default_factory=list)
    decisions: List[Decision] = field(default_factory=list)
    open_questions: List[OpenQuestion] = field(default_factory=list)


GRAPH_MODEL = GeneralExtraction
PROTECTED_TYPES = ("person", "organization", "Idea")  # never auto-merged on weak similarity


def object_schema(properties, required=None):
    return {"type": "object", "properties": properties,
            "required": list(properties) if required is None else required,
            "additionalProperties": False}


def string(limit=None):
    value = {"type": "string"}
    if limit:
        value["maxLength"] = limit
    return value


QUOTE = {"type": "string", "minLength": 1, "description": "At most 40 words, located verbatim after whitespace collapse in its chunk."}
DATE = {"type": ["string", "null"], "format": "date"}
HASH = {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"}
CANDIDATE = {"const": "Candidate"}
NODE_SCHEMAS = {
    "entities": object_schema(dict(name=string(120), entity_type={"enum": ["person", "organization", "work", "place", "term", "other"]}, aliases={"type": "array", "items": string()}, summary=string(400), status=CANDIDATE, quote=QUOTE), ["name", "entity_type", "status", "quote"]),
    "ideas": object_schema(dict(name=string(120), definition=string(400), domain=string(), status=CANDIDATE, quote=QUOTE), ["name", "definition", "status", "quote"]),
    "idea_links": object_schema(dict(source_name=string(120), relation={"enum": ["EXEMPLIFIES", "DEPENDS_ON", "CONTRADICTS", "SPECIALIZES", "DECIDED_IN", "APPLIES_TO"]}, target_name=string(120), quote=QUOTE)),
    "facts": object_schema(dict(subject=string(120), predicate=string(120), object=string(120), valid_from=DATE, valid_to=DATE, confidence={"type": "number", "minimum": 0, "maximum": 1}, quote=QUOTE), ["subject", "predicate", "object", "quote"]),
    "decisions": object_schema(dict(summary=string(400), decided_by=string(), decided_on=DATE, quote=QUOTE), ["summary", "quote"]),
    "open_questions": object_schema(dict(question=string(400), quote=QUOTE)),
}
ENTRY_SCHEMA = object_schema(dict(chunk_index={"type": "integer", "minimum": 0}, chunk_hash=HASH,
    extracted_on={"type": "string", "format": "date"},
    **{name: {"type": "array", "items": node} for name, node in NODE_SCHEMAS.items()}))
SCHEMA = object_schema(dict(schema={"const": "extraction/0.1.0"}, dataset=string(), source_path=string(),
    source_hash=HASH, pack=string(), pack_version=HASH, entries={"type": "array", "items": ENTRY_SCHEMA}))
