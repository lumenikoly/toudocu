# Reader-first writing gate

Apply to reader-facing prose, headings, tables, diagrams, messages and
translations. Review the changed text after gathering evidence; return `PASS`
only when all applicable rules pass, otherwise `NEEDS_REWORK` with `WRITE-*`
codes and concrete fixes. This gate checks expression, not factual truth.

| Rule | Check |
|---|---|
| `WRITE001` | Identify the reader, useful question/action and intended understanding; do not write for the template or validator. |
| `WRITE002` | Preserve the canonical document language unless migration is authorized; new documents use the active locale, translations the selected target. Keep each passage in one natural language. |
| `WRITE003` | Explain uncommon terms through meaning before exact code tokens. Keep an identifier only when it helps trace a contract/fact; widely understood technical names need no forced explanation. |
| `WRITE004` | State who acts, what happens, relevant conditions and observable consequences. Prefer concrete active statements. |
| `WRITE005` | Replace vague verbs and noun piles with behavior, a boundary or a decision. Technical detail must explain why it matters, not necessarily mention an end user. |
| `WRITE006` | Lead with the rule/conclusion; one main point per paragraph. Remove repetition, filler and implementation details irrelevant to the reader. |
| `WRITE007` | Separate verified behavior, requirements, plans and gaps. State material exclusions, failure/recovery conditions and uncertainty; never imply planned behavior is implemented. |
| `WRITE008` | Use idiomatic target-language grammar and the authoritative glossary. Avoid literal translations, mixed-language hybrids and unnecessary transliteration; report material terminology conflicts. |
| `WRITE009` | Treat table cells and visible diagram labels as prose. Show actions/events/outcomes and meaningful questions/branches, not unexplained variables or assignments. |
| `WRITE010` | Procedures have actors, prerequisites, ordered actions and observable results. Failures explain impact, system response and how the reader can continue. |

Commands, flags, paths, filenames, URLs, stable IDs, API fields, enum values,
events, protocol names and official names stay exact, especially in code spans.
Keep Mermaid keywords/node IDs/shapes unchanged; translate visible labels.
Exact component names may remain in technical diagrams, but arrows describe
interactions naturally. Keep exact business event names after their explanation
only when contract-relevant.

Before returning PASS, read changed prose/labels continuously in their language:
fix translated-sounding sentences, unexplained terms and unsupported claims;
confirm facts/plans/gaps remain distinct. Review only changed/affected passages,
not every repository document. Examples and eval transcripts are not required
runtime reading.
