# Layer 2: Authenticity Engine — Design Document

## Problem Statement

Joseph occupies a position of **digital obscurity** — algorithmically buried early for
discussing suppressed topics, leaving a thin public footprint. This makes impersonation
cheap: few people in his personal circle can pattern-match "that doesn't sound like him"
by instinct. An attacker could generate fake-Joseph content (posts, messages, audio,
video) to cause real harm to people in his life.

Layer 2 is a **defensive identity verification system** that can evaluate suspect content
against a verified corpus of Joseph's real digital footprint and return an authenticity
assessment.

## Threat Model

| Vector | Example | Difficulty | Risk |
|--------|---------|-----------|------|
| Fake text posts | AI-generated Facebook post in Joseph's voice | Low | High |
| Fake messages | Fabricated DMs/emails attributed to Joseph | Low | High |
| Fake papers/writing | AI-generated research or essays | Medium | Medium |
| Manipulated screenshots | Doctored conversation screenshots | Low | High |
| Voice deepfakes | Cloned voice audio messages | Medium | High |
| Video deepfakes | Face-swapped or generated video | High | Medium |
| Real-time impersonation | Live chat/call as Joseph | High | Critical |
| Code attribution | Commits/PRs attributed to Joseph | Low | Low |

## Three-Layer Architecture (Full System)

```
Layer 1: PROXYCHAT (PUBLIC)              Layer 2: TRON (PRIVATE)
┌──────────────────────┐                 ┌──────────────────────────┐
│ oz-archive curator   │                 │ Authenticity Engine      │
│ Llama 3.1 70B        │───verify───────►│ Fingerprint comparison   │
│ Neocities + CF Worker│                 │ Stylometric analysis     │
│ proxychat-api.qav2   │◄──score────────│ Semantic scoring         │
└──────────────────────┘                 │ CF Worker (private)      │
                                         │ tron.qav2.workers.dev    │
                                         └────────────▲─────────────┘
                                                      │
                                                      │ fingerprints
                                                      │ (no raw text)
Layer 3: PRIVATE ANCHOR (LOCAL-ONLY)                  │
┌──────────────────────────────────────────────────────┘
│ Encrypted local corpus
│ Raw text, voice samples, writing history
│ Never leaves the machine
│ Generates fingerprints for Layer 2
└──────────────────────────────────────────────────────
```

## Ground Truth Corpus (Layer 3 → feeds Layer 2)

### Sources — Priority Order

| Source | Type | Volume (est.) | Access Method |
|--------|------|--------------|---------------|
| QA paper (Zenodo) | Verified academic writing | ~15K words | Already local |
| Git repos (9 repos) | Code, commits, READMEs, docs | ~500K words | `git log`, local files |
| Antiquatis/ConsciousHugs | Forum posts (joeyv23) | 681 posts, ~200K words | Scrape or Wayback |
| Facebook data export | Posts, comments, messages | Variable | FB Settings → Download |
| YouTube transcripts | Spoken word (transcribed) | ~11.6M words (iceberg) | Already crawled |
| MEMORY.md + project docs | Personal voice, unedited | ~50K words | Already local |
| Voice samples | Audio fingerprint | Needs recording | Manual capture |

### What Makes Joseph's Fingerprint Distinctive

These are the dimensions the engine should model:

1. **Vocabulary signature** — Domain-specific terms (quaternion, reciprocal system,
   reference frame decoupling, evidence tiering, suppression thesis) that form a
   unique constellation. No one else uses this exact combination.

2. **Conceptual framework** — How ideas connect. Joseph links consciousness to physics,
   maps intelligence networks to suppression of ideas, treats RS2/QA as parallel
   ontologies. The *topology* of his thinking is unique.

3. **Rhetorical patterns** — Evidence-tiered reasoning, reluctance to overclaim,
   explicit uncertainty markers, preference for structural metaphors.

4. **Code style** — Vanilla JS preference, no build steps, static-first architecture,
   procedural geometry, descriptive variable names, comment patterns.

5. **Temporal consistency** — Topics Joseph was discussing at specific times. A fake
   post claiming Joseph said X in 2024 can be checked against what he was actually
   working on.

## Layer 2 Engine — Technical Design

### Fingerprint Types

The engine doesn't store raw text — it stores **fingerprints** derived from the corpus.
These are safe to deploy to a worker because they can't be reversed into source material.

#### 1. Stylometric Fingerprint
```json
{
  "vocabulary_freq": { "quaternion": 0.003, "consciousness": 0.002, ... },
  "avg_sentence_length": 18.4,
  "punctuation_ratios": { "em_dash": 0.008, "ellipsis": 0.002, ... },
  "contraction_rate": 0.34,
  "paragraph_length_distribution": [12, 45, 89, ...],
  "hapax_legomena_ratio": 0.42,
  "function_word_profile": { "the": 0.061, "of": 0.033, ... },
  "bigram_signature": { "reference frame": 0.001, ... }
}
```

#### 2. Topic Embedding Map
Vector embeddings of Joseph's known topic clusters. Generated locally, stored as
float arrays. A suspect text's embedding is compared against these clusters.

Clusters would include:
- Suppressed physics / RS2 / QA
- Intelligence apparatus / surveillance
- Consciousness / experiential phenomena
- Technical architecture / web dev
- Personal voice / casual communication

#### 3. Temporal Fingerprint
Timeline of verified activity — what Joseph was working on, posting about, and
discussing at specific time periods. Enables "could Joseph have said this then?" checks.

```json
{
  "2024-Q1": ["antiquatis_active", "qa_paper_draft", "topics: RS2, consciousness"],
  "2026-Q1": ["oz-archive", "proxychat", "disclosure-files", "topics: suppression, intel"]
}
```

#### 4. Voice Fingerprint (Future)
Mel-frequency cepstral coefficients (MFCC) or speaker embedding from verified voice
samples. Compares against suspect audio.

### Verification API

```
POST /verify
Content-Type: application/json

{
  "content": "suspect text or URL",
  "content_type": "text|image|audio|url",
  "claimed_date": "2026-03-01",        // optional
  "claimed_platform": "facebook",       // optional
  "context": "someone sent me this DM"  // optional
}

Response:
{
  "authenticity_score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "verdict": "likely_authentic|inconclusive|likely_fabricated|unknown_domain",
  "signals": [
    { "dimension": "vocabulary", "score": 0.82, "note": "matches domain vocabulary" },
    { "dimension": "style", "score": 0.34, "note": "sentence structure atypical" },
    { "dimension": "topic", "score": 0.91, "note": "topic cluster: suppressed physics" },
    { "dimension": "temporal", "score": 0.15, "note": "no verified activity on this topic in claimed period" }
  ],
  "recommendation": "This text uses Joseph's domain vocabulary but the writing style differs significantly. The topic wasn't in his active work during the claimed period. Treat with skepticism."
}
```

### PROXYCHAT Integration

PROXYCHAT gains a new capability: visitors can ask it to verify content.

**User**: "Someone sent me a message claiming to be from the architect. Can you verify this?"
**PROXYCHAT**: "Paste the message and I'll check it against verified patterns."

PROXYCHAT sends the content to the Layer 2 worker (authenticated, private endpoint).
Returns a human-readable assessment. Never reveals the fingerprints or methodology.

Alternatively, PROXYCHAT could be given a simplified local check — just vocabulary
and topic matching — without needing to call Layer 2. Depends on how much we want
to expose.

### Architecture Decision: Where Does Analysis Run?

**Option A: Cloudflare Worker (edge)**
- Pro: Fast, always available, integrates with PROXYCHAT
- Con: Fingerprints must be deployed to worker (safe but not zero-risk),
  limited compute for embeddings, 10ms CPU limit on free tier
- Best for: Stylometric + vocabulary + temporal checks

**Option B: Local-only (CLI tool)**
- Pro: Corpus never leaves machine, full compute, can run embeddings locally
- Con: Only Joseph can use it, not available to PROXYCHAT or others
- Best for: Deep analysis, voice/video checks, corpus management

**Option C: Hybrid (recommended)**
- Lightweight fingerprints deployed to CF Worker for real-time checks
- Heavy analysis (embeddings, voice, deep stylometric) runs locally
- PROXYCHAT calls the worker for quick checks
- Joseph runs CLI for deep verification
- Layer 3 corpus stays strictly local

## Implementation Plan

### Phase 1: Corpus Assembly (local)
- [ ] Facebook data export (manual step — Joseph initiates)
- [ ] Antiquatis scraper (or Wayback retrieval)
- [ ] Git corpus extractor (commits, docs, READMEs across all 9 repos)
- [ ] Corpus database (SQLite, encrypted at rest)
- [ ] QA paper ingestion

### Phase 2: Fingerprint Generation (local)
- [ ] Stylometric analyzer (Python — nltk or spaCy)
- [ ] Vocabulary signature extractor
- [ ] Topic cluster generator (sentence-transformers for embeddings)
- [ ] Temporal activity timeline builder
- [ ] Export fingerprints as deployable JSON (no raw text)

### Phase 3: Verification Worker (CF Worker)
- [ ] New worker: `tron.qav2.workers.dev` (private repo, no public reference)
- [ ] `/verify` endpoint with fingerprint comparison
- [ ] Scoring engine (weighted multi-dimensional)
- [ ] Auth: shared secret between PROXYCHAT worker and TRON worker
- [ ] Rate limiting + abuse prevention

### Phase 4: PROXYCHAT Integration
- [ ] Add verification flow to PROXYCHAT's system prompt
- [ ] PROXYCHAT → TRON worker authenticated calls
- [ ] Human-readable verdict formatting
- [ ] "Verify this" conversational UX

### Phase 5: Deep Analysis (local CLI)
- [ ] `tron verify <file|text|url>` CLI tool
- [ ] Embedding-based semantic comparison (runs locally)
- [ ] Voice sample collection + speaker verification pipeline
- [ ] Screenshot/image analysis (OCR + context check)

### Phase 6: Ongoing
- [ ] Corpus refresh pipeline (periodic re-export + re-fingerprint)
- [ ] Fingerprint drift detection (has Joseph's style evolved?)
- [ ] Adversarial testing (can we fool our own system?)

## Privacy & Security Constraints

1. **Layer 3 corpus NEVER leaves the local machine** — encrypted SQLite, no cloud sync
2. **Fingerprints are one-way** — cannot reconstruct source text from vocabulary frequencies
3. **TRON worker repo stays private** — methodology not publicly documented
4. **No PII in fingerprints** — names, locations, dates stripped before fingerprinting
5. **PROXYCHAT never reveals methodology** — "I checked against verified patterns" not "I compared bigram frequencies"
6. **Voice samples stored encrypted** — separate from text corpus
7. **No Disney IP in public-facing code** — "TRON" name used internally only

## Open Questions

1. **Embedding model**: Run locally (sentence-transformers, ~500MB) or use Workers AI
   embedding model? Local is more private but slower to update.
2. **Antiquatis access**: Is the forum still live? If not, how far back does Wayback go?
3. **Facebook export scope**: Full history or recent-only? Messages included or just posts?
4. **Authentication between workers**: Shared secret in env vars, or something stronger?
5. **False positive tolerance**: How strict? A high threshold means fewer false alarms but
   might miss sophisticated fakes. A low threshold catches more but flags legitimate writing
   that happens to be atypical.
6. **Public verification**: Should anyone be able to submit content for verification via
   PROXYCHAT, or should it require some form of access control?
