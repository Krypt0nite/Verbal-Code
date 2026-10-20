# Question authoring guide

How to add or change practice questions so they pass validation and give honest feedback.

## Taxonomy

`src/data/taxonomy.json` defines 8 categories and their subcategories. The dropdowns are generated from it, so adding a subcategory there makes it selectable immediately.

| Category id | Subcategories |
| --- | --- |
| `tech-ai` | programming-languages (concepts shared by all languages), dsa, system-design, backend-engineering, frontend-engineering, databases-and-storage, networking, operating-systems, cloud-and-devops, distributed-systems, api-design, security, software-architecture, testing-and-quality-engineering, performance-engineering, ai-ml, genai-llms, data-engineering, compilers-and-build-systems, developer-tools, low-level-design (OOP, design patterns, class design), packet-processing (DPDK and kernel-bypass networking) |
| `programming-languages` | cpp, go, python, rust, java, javascript-typescript |
| `interview-skills` | personal-introduction, project-deep-dives, behavioral-questions, technical-communication, problem-solving-explanations, leadership-and-teamwork, trade-offs-and-decision-making |
| `communication-english` | grammar, vocabulary, conciseness, explaining-complex-ideas, impromptu-speaking, professional-communication |
| `general-knowledge` | science, history, literature, geography, economics, current-affairs |
| `business` | startups, product-management, business-strategy, entrepreneurship, personal-finance |
| `science-engineering` | mathematics, physics, chemistry, quantum-mechanics, semiconductor-technology, materials-science, nanotechnology |
| `fitness-nutrition` | sports-science, exercise-fundamentals, nutrition-education, healthy-habits |

## Where questions live

Questions live in `src/data/questions/<category-id>.json` as `{ "categoryId": "...", "questions": [...] }`. New files in that folder are picked up automatically. Each question is validated on its own: an invalid question is skipped and reported, and the rest of its file still loads. Tests fail on any validation issue, so nothing invalid can ship.

## Which rubric to use

The subcategory also selects a **topic profile** (`src/evaluation/topics/`) that rewords the rubric for the subject and adds common misconceptions; see EVALUATION.md. Questions need no extra fields for this. When you write keywords, remember that the local evaluator gives full credit only when a concept is explained ("because", "which", "so"… nearby), so keywords should name the concept, not the explanation.

| Subcategory | `rubricId` | Concept criteria you may reference |
| --- | --- | --- |
| `tech-ai/dsa`, `interview-skills/problem-solving-explanations` | `dsa` | correctness, time-complexity, space-complexity, edge-cases, alternatives |
| `tech-ai/system-design` | `system-design` | requirements, architecture, scaling, reliability, bottlenecks, consistency-failure, trade-offs |
| `programming-languages/*`, `tech-ai/programming-languages` | `programming-language` | correctness, terminology, practical-implications, pitfalls |
| Other `tech-ai/*` (API design, databases, OS, networking, distributed systems, AI/ML, GenAI…) | `technical-concept` | correctness, mechanism, trade-offs |
| `interview-skills/*` | `behavioral` or `communication` | see `src/evaluation/rubrics/index.ts` |
| Non-technical categories | `general-explanation` | accuracy |

Criteria with a structural signal (for example `examples`, `structure`, `reasoning`) are measured from the transcript and must not be used in `expectedConcepts`.

## Modes

| Kind of question | Modes |
| --- | --- |
| Technical, beginner or intermediate | `interview`, `deep-research`, `mock-interview`, `off-the-cuff` |
| Technical, advanced | `interview`, `deep-research`, `mock-interview` (no `off-the-cuff`, because that mode gives no preparation time) |
| Non-technical (`general-explanation`) | `off-the-cuff`, `deep-research` |

A test enforces the advanced rule. It lists 21 older advanced questions that still allow off-the-cuff; do not add to that list.

## Example

```json
{
  "id": "dsa-union-find",
  "title": "Union-find (disjoint set union)",
  "prompt": "Explain the union-find data structure. Walk through find and union, path compression and union by rank or size, and their combined complexity. Give two problems it solves well.",
  "categoryId": "tech-ai",
  "subcategoryId": "dsa",
  "difficulty": "advanced",
  "suggestedDurationSec": 180,
  "tags": ["graphs", "union-find"],
  "rubricId": "dsa",
  "modes": ["interview", "deep-research", "mock-interview"],
  "expectedConcepts": [
    { "id": "ops", "label": "Parent array; find root, union by linking roots", "criterion": "correctness", "keywords": ["parent", "root", "representative"] },
    { "id": "time", "label": "Time complexity", "criterion": "time-complexity", "keywords": ["inverse ackermann", "amortized", "nearly constant"] }
  ],
  "researchContext": ["Optional curated notes shown in Deep research mode."],
  "modelAnswer": "A concise, technically correct outline of a strong answer…"
}
```

## Rules enforced by schema and tests

- `id`: unique kebab-case slug, stable forever (it is stored in history). Prefix with the area: `dsa-`, `sd-`, `api-`, `db-`, `os-`, `net-`, `ds-`, `ml-`, `genai-`, `cpp-`, `go-`, `gk-`, `lit-`, `geo-`, `ca-`, `biz-`, `ent-`, `pf-`, `ss-`, `nut-`, `lld-`, `dpdk-`.
- `subcategoryId` must belong to `categoryId`, and the file's `categoryId` must match.
- `title`: 5–120 characters. `prompt`: 20–800 characters, English, ASCII punctuation (straight quotes).
- `suggestedDurationSec`: 60–600.
- Concept `id`s: at least 2 characters, unique within the question.
- Each `expectedConcepts[].criterion` must be a concept criterion of the chosen rubric.
- Questions whose rubric has concept criteria need at least one expected concept.
- Prompts and ids must be unique across the bank.
- Keywords must not be generic everyday words (`cost`, `memory`, `test`, `wait`, `first`, `like`, `data`…). The full list is in `questionBank.test.ts`.

Run `npm run validate:questions` after editing, then `npm run check`.

## Writing good questions

- Ask for an explanation, not a definition: "Explain how… why… when it fails… compare with…". For senior-level practice, frame a scenario ("a service starts failing with…") and ask how to diagnose it.
- Put the expected coverage in the prompt: complexity, an example, failure modes, trade-offs, common mistakes.
- Difficulty: beginner = core concept; intermediate = mechanism plus trade-offs; advanced = internals, failure modes, production scenarios, or design under constraints.
- Model answers are shown to users as the reference, so every claim must be correct. Prefer stable facts; avoid fast-changing numbers (prices, model names, version-specific limits) unless the question is about them, and say "around" or "typically" for figures that vary.
- Current-affairs questions should be framed so they stay true (processes, debates, trade-offs) rather than depending on the latest news.
- Health and finance questions are general education. Do not give personal medical or investment advice.

## Writing keywords

Concept coverage is keyword-based and labelled as such in the feedback. Badly chosen keywords make feedback dishonest.

- Use lowercase phrases. Punctuation is ignored, so "O(log n)" becomes "o log n" and "C++17" becomes "c 17".
- Keywords of four characters or fewer match whole words (with an optional plural). Longer keywords match as prefixes, so "replica" also matches "replication".
- Give 3–6 spoken variants per concept: the technical term, a common paraphrase, and an example ("write ahead log", "wal", "log first").
- Never use words that appear in any answer on the topic. "memory" in a KV-cache question credits the concept without explaining it. Prefer specific phrases: "memory bandwidth", "grows with context".
- Avoid short ambiguous tokens ("ir", "cas", "sat", "top"), and stopwords ("and", "over").

## Research notes

`researchContext` is optional. Deep research mode shows these notes during preparation; without notes it shows a generic answer outline. Add 2–4 accurate, short notes for questions where a fact or reference genuinely helps preparation.
