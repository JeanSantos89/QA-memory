"""Cross-language retrieval bridge (PT<->EN).

The embedder (all-MiniLM-L6-v2) is English-centric: a Portuguese query about
English-stored rules lands far in vector space (cosine < floor) AND LIKE never
matches across languages, so retrieval returns 0 and analyze_impact goes blind.
This was PROVEN live (STATE): the same change in English surfaced the exact
conflict; in Portuguese it returned nothing.

Fix WITHOUT reindexing: translate the query to the OTHER language via the
injected LLMClient and retrieve with BOTH the original and the translation
(union of candidates). Memory may be mixed PT+EN — both halves get reached.

Robustness across LLMs (user runs local llama; others run Anthropic/Gemini):
the translation is VALIDATED (non-empty, actually changed, no obvious refusal).
A weak model that returns junk/echoes the input does NOT poison retrieval — we
degrade to the original query and surface a NOTE telling the user the model may
not handle cross-language retrieval (suggest a stronger QA_MEMORY_LLM_MODEL).
Never raises; never blocks the assess.

Scope is PT<->EN only (product decision) — the only languages in use.
"""

from __future__ import annotations

from qa_memory.pipeline.llm import LLMClient

# Note surfaced (in the change's language) when translation can't be trusted, so
# the user knows cross-language recall is degraded and how to fix it.
DEGRADE_NOTE_EN = (
    "Cross-language retrieval limited: the LLM did not produce a usable "
    "translation of the query, so only the original language was searched. "
    "If memory is in another language, try a stronger QA_MEMORY_LLM_MODEL."
)
DEGRADE_NOTE_PT = (
    "Busca entre idiomas limitada: o LLM não produziu uma tradução utilizável "
    "da consulta, então só o idioma original foi pesquisado. Se a memória está "
    "em outro idioma, tente um QA_MEMORY_LLM_MODEL mais forte."
)

# Common Portuguese function words / accented chars — enough to tell PT from EN
# for short QA changes. Heuristic only: no fragile lang-detect dep, no LLM call.
_PT_MARKERS = (
    " de ", " da ", " do ", " das ", " dos ", " que ", " não ", " para ",
    " com ", " uma ", " após ", " até ", " já ", " é ", " são ", " ção",
    " mudança", " regra", " permitir", " quando", " sobre ",
)
_PT_CHARS = set("áàâãéêíóôõúüç")


def detect_lang(text: str) -> str:
    """Return 'pt' or 'en' for a short query. Heuristic, PT<->EN only.

    Accented chars or common PT function words → pt; otherwise en. Defaulting to
    en is safe: en→pt translation still runs and unions candidates.
    """
    t = text.lower()
    if any(c in _PT_CHARS for c in t):
        return "pt"
    padded = f" {t} "
    if any(m in padded for m in _PT_MARKERS):
        return "pt"
    return "en"


_TRANSLATE_SYSTEM = (
    "You are a translator. Translate the user's text to {target}. "
    "Output ONLY the translation as plain text — no quotes, no notes, no JSON, "
    "no explanation. Preserve technical terms and meaning."
)


def _looks_like_refusal(text: str) -> bool:
    low = text.lower()
    return any(
        s in low
        for s in ("i cannot", "i can't", "i'm sorry", "as an ai", "não posso")
    )


def _validate(translation: str, original: str, target_lang: str) -> bool:
    """Trust the translation only if it's non-empty, changed, not a refusal,
    and lands in roughly the right language. Conservative — a false negative
    just degrades to original-only, which is the safe direction."""
    t = translation.strip()
    if not t or _looks_like_refusal(t):
        return False
    # An echo of the input is no translation.
    if t.strip().lower() == original.strip().lower():
        return False
    produced = detect_lang(t)
    # Want the translation to read as the target language. detect_lang only
    # tells pt vs en; require it not to be the source language.
    return produced == target_lang


def translate_query(
    change: str, client: LLMClient, max_tokens: int = 256
) -> tuple[str | None, str | None]:
    """Translate `change` to the other PT<->EN language for cross-language recall.

    Returns (translation, note):
      - (translated_text, None) when the translation is trustworthy,
      - (None, degrade_note) when it isn't — caller searches original-only and
        surfaces the note.
    Never raises: any LLM/transport error degrades to (None, note).
    """
    src = detect_lang(change)
    target = "en" if src == "pt" else "pt"
    target_name = "English" if target == "en" else "Portuguese"
    note = DEGRADE_NOTE_PT if src == "pt" else DEGRADE_NOTE_EN
    try:
        resp = client.complete(
            _TRANSLATE_SYSTEM.format(target=target_name), change, max_tokens
        )
    except Exception:  # noqa: BLE001 — any failure degrades, never blocks assess
        return None, note
    translation = resp.text.strip()
    if _validate(translation, change, target):
        return translation, None
    return None, note
