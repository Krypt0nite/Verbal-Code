# Question bank audit

Audit of `src/data/questions/*.json` against `src/data/taxonomy.json`, carried out on 19 October 2026. All counts below were computed directly from the JSON files with a script, not taken from earlier reports.

## Totals

| Snapshot | Questions |
| --- | ---: |
| Last commit (`ab93096`, "Expand the question bank to 179 questions") | 179 |
| Working tree at the start of this audit (uncommitted batch of 75) | 254 |
| After this audit | **564** |

Per category after the audit: tech-ai 323, programming-languages 130, science-engineering 36, general-knowledge 26, business 20, fitness-nutrition 14, interview-skills 9, communication-english 6.

## Targets for priority areas

| Area | Target | Before (commit) | After | Advanced |
| --- | --- | ---: | ---: | ---: |
| C++ | 50–60 | 18 | 50 | 23 |
| Go | 40–50 | 15 | 40 | 16 |
| DSA | 60–80 | 6 | 61 | 28 |
| System design | 50–60 | 8 | 50 | 30 |
| API design | 35–40 | 1 | 35 | 14 |
| Databases and storage | 25–35 | 2 | 25 | 9 |
| Operating systems | 25–35 | 2 | 25 | 9 |
| Networking | 25–35 | 2 | 25 | 8 |
| Distributed systems | 30–40 | 2 | 30 | 16 |
| AI and machine learning | 25–35 | 3 | 26 | 5 |
| Generative AI and LLMs | 25–35 | 3 | 26 | 13 |
| 9 empty non-technical subcategories | 5–10 each | 0 | 6 each | – |

Every target was reached at its lower bound. I stopped there rather than add weaker questions to reach the upper bounds.

## Every category and subcategory

"Before" is the last commit. Difficulty columns are after the audit.

| Category | Subcategory | Before (HEAD) | After | Beginner | Intermediate | Advanced |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| tech-ai | programming-languages | 2 | 2 | 1 | 1 | 0 |
| tech-ai | dsa | 6 | 61 | 4 | 29 | 28 |
| tech-ai | system-design | 8 | 50 | 3 | 17 | 30 |
| tech-ai | backend-engineering | 5 | 5 | 1 | 3 | 1 |
| tech-ai | frontend-engineering | 5 | 5 | 1 | 3 | 1 |
| tech-ai | databases-and-storage | 2 | 25 | 2 | 14 | 9 |
| tech-ai | networking | 2 | 25 | 7 | 10 | 8 |
| tech-ai | operating-systems | 2 | 25 | 3 | 13 | 9 |
| tech-ai | cloud-and-devops | 1 | 1 | 0 | 1 | 0 |
| tech-ai | distributed-systems | 2 | 30 | 1 | 13 | 16 |
| tech-ai | api-design | 1 | 35 | 2 | 19 | 14 |
| tech-ai | security | 1 | 1 | 0 | 1 | 0 |
| tech-ai | software-architecture | 1 | 1 | 0 | 0 | 1 |
| tech-ai | testing-and-quality-engineering | 1 | 1 | 1 | 0 | 0 |
| tech-ai | performance-engineering | 1 | 1 | 0 | 0 | 1 |
| tech-ai | ai-ml | 3 | 26 | 5 | 16 | 5 |
| tech-ai | genai-llms | 3 | 26 | 0 | 13 | 13 |
| tech-ai | data-engineering | 1 | 1 | 0 | 1 | 0 |
| tech-ai | compilers-and-build-systems | 1 | 1 | 0 | 1 | 0 |
| tech-ai | developer-tools | 1 | 1 | 1 | 0 | 0 |
| programming-languages | cpp | 18 | 50 | 5 | 22 | 23 |
| programming-languages | go | 15 | 40 | 5 | 19 | 16 |
| programming-languages | python | 12 | 12 | 5 | 5 | 2 |
| programming-languages | rust | 12 | 12 | 3 | 5 | 4 |
| programming-languages | java | 8 | 8 | 2 | 4 | 2 |
| programming-languages | javascript-typescript | 8 | 8 | 2 | 5 | 1 |
| interview-skills | personal-introduction | 1 | 1 | 1 | 0 | 0 |
| interview-skills | project-deep-dives | 1 | 1 | 0 | 1 | 0 |
| interview-skills | behavioral-questions | 3 | 3 | 1 | 2 | 0 |
| interview-skills | technical-communication | 1 | 1 | 1 | 0 | 0 |
| interview-skills | problem-solving-explanations | 1 | 1 | 1 | 0 | 0 |
| interview-skills | leadership-and-teamwork | 1 | 1 | 0 | 1 | 0 |
| interview-skills | trade-offs-and-decision-making | 1 | 1 | 0 | 0 | 1 |
| communication-english | grammar | 1 | 1 | 1 | 0 | 0 |
| communication-english | vocabulary | 1 | 1 | 0 | 1 | 0 |
| communication-english | conciseness | 1 | 1 | 1 | 0 | 0 |
| communication-english | explaining-complex-ideas | 1 | 1 | 1 | 0 | 0 |
| communication-english | impromptu-speaking | 1 | 1 | 1 | 0 | 0 |
| communication-english | professional-communication | 1 | 1 | 0 | 1 | 0 |
| general-knowledge | science | 0 | 6 | 4 | 2 | 0 |
| general-knowledge | history | 1 | 1 | 1 | 0 | 0 |
| general-knowledge | literature | 0 | 6 | 3 | 3 | 0 |
| general-knowledge | geography | 0 | 6 | 3 | 3 | 0 |
| general-knowledge | economics | 1 | 1 | 1 | 0 | 0 |
| general-knowledge | current-affairs | 0 | 6 | 0 | 6 | 0 |
| business | startups | 1 | 1 | 1 | 0 | 0 |
| business | product-management | 1 | 1 | 0 | 1 | 0 |
| business | business-strategy | 0 | 6 | 1 | 5 | 0 |
| business | entrepreneurship | 0 | 6 | 2 | 4 | 0 |
| business | personal-finance | 0 | 6 | 3 | 3 | 0 |
| science-engineering | mathematics | 6 | 6 | 3 | 2 | 1 |
| science-engineering | physics | 8 | 8 | 4 | 3 | 1 |
| science-engineering | chemistry | 11 | 11 | 4 | 7 | 0 |
| science-engineering | quantum-mechanics | 3 | 3 | 0 | 2 | 1 |
| science-engineering | semiconductor-technology | 3 | 3 | 0 | 2 | 1 |
| science-engineering | materials-science | 3 | 3 | 1 | 1 | 1 |
| science-engineering | nanotechnology | 2 | 2 | 0 | 1 | 1 |
| fitness-nutrition | sports-science | 0 | 6 | 2 | 4 | 0 |
| fitness-nutrition | exercise-fundamentals | 1 | 1 | 1 | 0 | 0 |
| fitness-nutrition | nutrition-education | 0 | 6 | 2 | 4 | 0 |
| fitness-nutrition | healthy-habits | 1 | 1 | 1 | 0 | 0 |

## Empty subcategories

- **Before:** 9 empty subcategories — general-knowledge/science, literature, geography, current-affairs; business/business-strategy, entrepreneurship, personal-finance; fitness-nutrition/sports-science, nutrition-education.
- **After:** none. Each now has 6 questions.

## Subcategories still underpopulated (fewer than 5 questions)

These areas were outside the priorities of this audit and still need work:

- **tech-ai:** programming-languages (2), cloud-and-devops (1), security (1), software-architecture (1), testing-and-quality-engineering (1), performance-engineering (1), data-engineering (1), compilers-and-build-systems (1), developer-tools (1)
- **interview-skills:** every subcategory has 1, except behavioral-questions with 3
- **communication-english:** every subcategory has 1
- **general-knowledge:** history (1), economics (1)
- **business:** startups (1), product-management (1)
- **science-engineering:** quantum-mechanics (3), semiconductor-technology (3), materials-science (3), nanotechnology (2)
- **fitness-nutrition:** exercise-fundamentals (1), healthy-habits (1)

Recommended next: security, cloud and DevOps, and performance engineering, which matter most for interviews.

## Quality findings

| Check | Result |
| --- | --- |
| Schema validation (`npm run validate:questions`) | Passes, no issues |
| Missing or short model answers (< 150 characters) | None |
| Duplicate ids, titles or prompts | None |
| Broken category or subcategory mappings | None |
| Rubric assignment versus subcategory | All consistent with the authoring guide |
| Near-duplicate prompts (word-overlap similarity ≥ 0.35) | None |

Closest pairs, word-overlap similarity between 0.22 and 0.31. They were reviewed and kept as deliberate progressions:

- `be-idempotency` (intermediate, the concept) → `api-idempotency-keys` (advanced). The advanced prompt was rewritten to focus only on server-side implementation, so it no longer repeats the basics.
- `cpp-virtual-dispatch` (intermediate) → `cpp-object-layout-vtable` (advanced: multiple and virtual inheritance).
- `dsa-edit-distance` and `dsa-longest-common-subsequence`: related DP problems with different recurrences.
- `go-errors-defer` (beginner) → `go-error-wrapping` (intermediate).
- `sd-load-balancer` (beginner) → `net-l4-vs-l7-load-balancing` (intermediate).

### Problems found and fixed

1. **Generic keywords inflated concept coverage.** Short keywords match whole words anywhere in a transcript, so words such as "any", "try", "get", "new", "log", "ok", "cost", "memory", "test" and "wait" credited a concept without the speaker explaining it. This conflicted with the rule "never fabricate feedback". 154 such keywords were removed, keeping those that are the technical term itself (for example `key` for React keys and `set` for Python sets). A test now blocks them.
2. **One invalid question silently dropped its whole file.** `buildQuestionBank` parsed each file as a single unit, so one bad field made every question in that file disappear (in production only a console warning would show). During this audit a two-character concept id removed about 290 tech-ai questions at once. Questions are now validated one at a time, and a regression test covers this.
3. **A selector test depended on the bank having exactly 2 networking questions.** It now uses a fixed two-question pool.
4. **Two non-technical questions were marked advanced** while non-technical questions only use off-the-cuff and deep-research modes. They were re-rated intermediate.

### Remaining issues

- **Off-the-cuff mode policy.** The product does not technically exclude advanced questions from off-the-cuff mode. By convention new advanced technical questions leave it out, and a test enforces this, but 21 older advanced questions still include it (listed in `questionBank.test.ts`). Decide whether to keep that.
- **Deep research notes.** 1,296 of 1,325 questions have no `researchContext`. Deep research mode now shows a generic answer outline instead of nothing, but curated notes would make the mode more useful.
- **Keyword matching is a heuristic.** Paraphrases can be missed and a mention is not proof of understanding. The feedback report says this.
- **No AI fact-check of model answers.** Model answers were written and reviewed by hand. Spot-check before relying on them for high-stakes preparation, especially numbers in finance, health and current-affairs answers.

## CSV backlog integration (20 October 2026)

Source: `VerbalCode_New_Question_Backlog_1160.csv` (rows VCN0001–VCN1160). Each row was compared with the existing bank and with the other CSV rows. When a row asked the same core question as an existing question or as another row, only one was kept.

| | Questions |
| --- | ---: |
| Bank before | 564 |
| CSV rows | 1,160 |
| Added | **761** |
| Rejected as duplicates | 399 |
| Bank after | **1,325** |

Added per category: tech-ai 270, programming-languages 81, interview-skills 92, communication-english 72, general-knowledge 71, science-engineering 86, business 42, fitness-nutrition 47.

Every added question keeps its CSV number as a tag (`vcn-0001` and so on), so it can be traced back to the backlog. Each one has a model answer of about one minute of speech, and concept keywords for the local evaluator. The "Backend-Adjacent Observability" rows have no subcategory of their own and were added to `backend-engineering`.

### Rejected rows

Most rejections in the deep technical sections are there because the bank already covered that topic in depth (for example C++ smart pointers, Go `errors.Is`/`As`, the transactional outbox, KV cache and quantisation).

| CSV section | Rows | Added | Rejected rows |
| --- | ---: | ---: | --- |
| Programming Concepts | 20 | 19 | 12 |
| Cloud & DevOps | 25 | 21 | 23, 34, 36, 39 |
| Security | 25 | 16 | 46, 50, 51, 52, 57, 58, 59, 62, 63 |
| Software Architecture | 20 | 15 | 71, 73, 74, 87, 89 |
| Testing & Quality | 20 | 19 | 103 |
| Performance Engineering | 20 | 16 | 112, 117, 119, 123 |
| Data Engineering | 20 | 16 | 132, 134, 147, 149 |
| Compilers & Build Systems | 20 | 14 | 151, 152, 154, 156, 158, 166 |
| Developer Tools | 20 | 17 | 173, 177, 181 |
| Backend Engineering | 25 | 14 | 194, 195, 197, 201–205, 208, 210, 213 |
| Frontend Engineering | 25 | 22 | 229, 231, 237 |
| Databases & Storage | 25 | 11 | 241, 244–246, 248, 250–252, 254–258, 261 |
| Networking | 25 | 14 | 269, 273–275, 277, 279–281, 283, 285, 287 |
| Operating Systems | 25 | 5 | 291, 292, 294–302, 304–307, 309, 310, 312, 314, 315 |
| Distributed Systems | 25 | 10 | 316, 317, 319, 321–325, 327, 328, 331–333, 336, 339 |
| API Design | 25 | 6 | 341–344, 346, 348, 349, 351–358, 360, 361, 364, 365 |
| AI & Machine Learning | 25 | 13 | 367, 368, 370, 372, 373, 375–379, 381, 388 |
| Generative AI & LLMs | 30 | 13 | 392, 393, 395, 397–401, 403–407, 410, 412, 418, 420 |
| Backend-Adjacent Observability | 15 | 9 | 422, 423, 425, 430, 432, 433 |
| C++ | 40 | 14 | 437, 439, 442, 443, 445, 449, 451–453, 455–462, 464–467, 469, 472–475 |
| Go | 40 | 11 | 477–481, 483, 486, 487, 490–492, 494–506, 508, 509, 513–515 |
| Python | 30 | 14 | 516, 519, 520, 522–527, 530, 532, 536, 537, 539, 540, 544 |
| Rust | 30 | 12 | 546–548, 550, 553–563, 569, 570, 572 |
| Java | 25 | 17 | 576, 578, 580, 581, 585, 587, 590, 597 |
| JavaScript & TypeScript | 25 | 13 | 601, 604, 608, 610, 612, 614–617, 620, 622, 624 |
| Personal Introduction | 15 | 14 | 629 |
| Project Deep Dives | 20 | 17 | 643, 645, 660 |
| Behavioral Questions | 20 | 14 | 667, 669, 670, 673, 678, 679 |
| Technical Communication | 15 | 13 | 683, 694 |
| Problem-Solving Explanations | 15 | 10 | 696, 698–700, 702 |
| Leadership & Teamwork | 15 | 13 | 712, 723 |
| Trade-offs & Decision Making | 15 | 11 | 730, 732, 735, 740 |
| Grammar | 15 | 14 | 749 |
| Vocabulary | 15 | 14 | 765 |
| Conciseness | 15 | 13 | 780, 782 |
| Explaining Complex Ideas | 15 | 7 | 786, 793–797, 799, 800 |
| Impromptu Speaking | 15 | 12 | 805, 809, 814 |
| Professional Communication | 15 | 12 | 816, 820, 825 |
| History | 15 | 14 | 833 |
| Economics | 15 | 14 | 846 |
| Science (general knowledge) | 15 | 10 | 861, 864, 865, 870, 872 |
| Literature | 15 | 13 | 879, 882 |
| Geography | 15 | 12 | 891–893 |
| Current Affairs & Media Literacy | 15 | 8 | 906, 907, 912–914, 916, 917 |
| Startups | 15 | 9 | 921, 922, 926, 929, 930, 934 |
| Product Management | 15 | 12 | 938, 940, 942 |
| Business Strategy | 15 | 10 | 951, 953, 954, 961, 962 |
| Personal Finance | 15 | 11 | 968, 969, 972, 974 |
| Mathematics | 15 | 12 | 981, 988, 992 |
| Physics | 15 | 12 | 1000, 1003, 1005 |
| Chemistry | 15 | 9 | 1014–1017, 1019, 1023 |
| Quantum Mechanics | 15 | 10 | 1030, 1037–1040 |
| Semiconductor Technology | 20 | 17 | 1044, 1045, 1053 |
| Materials Science | 20 | 14 | 1061–1063, 1071, 1072, 1075 |
| Nanotechnology | 15 | 12 | 1081, 1082, 1088 |
| Exercise Fundamentals | 15 | 13 | 1097, 1106 |
| Nutrition Education | 20 | 14 | 1112, 1115, 1116, 1118, 1125, 1129 |
| Healthy Habits | 15 | 13 | 1137, 1141 |
| Sports Science | 15 | 7 | 1149, 1152, 1153, 1156–1160 |

### Other notes

- **Difficulty.** CSV difficulty labels were kept, except where they were clearly wrong. For example, "Horizontal versus vertical scaling" (VCN0029) was marked advanced and is now beginner. Advanced questions stay out of off-the-cuff mode, as the existing test requires.
- **Rubrics.** Technical rows use the technical-concept or programming-language rubric. Behavioural rows use the STAR rubric. Personal-introduction, conciseness, impromptu and professional-communication rows use the communication rubric. Everything else uses general-explanation with concept keywords.
- **Fixes needed by the larger bank.** 17 concept labels were shortened, because combined they made a feedback "next step" longer than the 300-character report limit. A selector test assumed security had only one mock-interview question; it now computes the pool size.
