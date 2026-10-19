# Topic taxonomy and question authoring

## Taxonomy

`src/data/taxonomy.json` defines 7 categories and their subcategories. The dropdowns are generated from it, so adding a subcategory there makes it selectable immediately.

| Category id | Subcategories |
| --- | --- |
| `tech-ai` | programming-languages, dsa, system-design, backend-engineering, frontend-engineering, databases-and-storage, networking, operating-systems, cloud-and-devops, distributed-systems, api-design, security, software-architecture, testing-and-quality-engineering, performance-engineering, ai-ml, genai-llms, data-engineering, compilers-and-build-systems, developer-tools |
| `interview-skills` | personal-introduction, project-deep-dives, behavioral-questions, technical-communication, problem-solving-explanations, leadership-and-teamwork, trade-offs-and-decision-making |
| `communication-english` | grammar, vocabulary, conciseness, explaining-complex-ideas, impromptu-speaking, professional-communication |
| `general-knowledge` | science, history, literature, geography, economics, current-affairs |
| `business` | startups, product-management, business-strategy, entrepreneurship, personal-finance |
| `science-engineering` | mathematics, physics, quantum-mechanics, semiconductor-technology, materials-science, nanotechnology |
| `fitness-nutrition` | sports-science, exercise-fundamentals, nutrition-education, healthy-habits |

## Adding a question

Questions live in `src/data/questions/<category-id>.json`, as `{ "categoryId": "...", "questions": [...] }`. New files in that folder are picked up automatically.

```json
{
  "id": "dsa-union-find",
  "title": "Union–find (disjoint set union)",
  "prompt": "Explain the union-find data structure. Describe find and union, path compression and union by rank, their complexity, and one problem where it is the right tool.",
  "categoryId": "tech-ai",
  "subcategoryId": "dsa",
  "difficulty": "intermediate",
  "suggestedDurationSec": 120,
  "tags": ["graphs", "data-structures"],
  "rubricId": "dsa",
  "modes": ["interview", "deep-research", "mock-interview"],
  "expectedConcepts": [
    { "id": "find-union", "label": "Find returns the root; union links roots", "criterion": "correctness", "keywords": ["find", "union", "root", "representative"] },
    { "id": "compression", "label": "Path compression and union by rank", "criterion": "time-complexity", "keywords": ["path compression", "union by rank", "inverse ackermann", "nearly constant"] }
  ],
  "researchContext": ["Optional curated notes shown in Deep research mode."],
  "modelAnswer": "A concise outline of a strong answer…"
}
```

### Rules (enforced by schema and tests)

- `id`: unique kebab-case slug, stable forever (it is stored in history). Prefix with the area (`dsa-`, `sd-`, `be-`…).
- `subcategoryId` must belong to `categoryId`, and the file's `categoryId` must match.
- `suggestedDurationSec`: 60–600. `prompt`: 20–800 characters, in English.
- `modes`: any of `off-the-cuff`, `interview`, `deep-research`, `mock-interview`.
- Each `expectedConcepts[].criterion` must be a **concept-scored** criterion of the chosen rubric (see EVALUATION.md). Concept ids must be unique within the question.
- Questions whose rubric has concept criteria must list at least one expected concept.

Run `npm run validate:questions` after editing.

### Writing good questions

- Ask for an **explanation**, not a definition: "Explain how… why… when it fails… compare with…".
- Include expectations in the prompt: complexity, an example, failure modes or trade-offs.
- Keywords: lowercase; give several spoken variants ("log n", "logarithmic"). Words of four letters or fewer must match whole words. Longer ones match as prefixes ("replica" matches "replication"). Avoid tiny ambiguous keywords like "ir" or "cas".
- Keep the `modelAnswer` accurate and concise. It is shown to users as the reference, so verify every claim.
- Prefer fewer, high-quality questions over many shallow ones.
