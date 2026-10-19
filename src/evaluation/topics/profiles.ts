import type { Misconception, TopicProfile } from './types';

// Negation and contraction forms after normalisation ("doesn't" → "doesnt").
const NOT = '(?:not|doesnt|dont|isnt|arent|cant|cannot|can not|never)';

const EXACTLY_ONCE: Misconception = {
  id: 'exactly-once-delivery',
  pattern: /\b(?:guarantees?|guaranteed|provides?|gives?|ensures?) exactly once (?:delivery|semantics)\b/,
  correction:
    'Exactly-once delivery over a network is impossible; systems give at-least-once delivery plus idempotent processing or deduplication ("effectively once").',
  certainty: 'possible',
};

const CAP_PICK_TWO: Misconception = {
  id: 'cap-pick-two',
  pattern: /\bcap\b.{0,60}\b(?:pick|choose) (?:any )?two\b/,
  correction:
    'Partitions are not optional in a distributed system, so CAP is a choice between consistency and availability while a partition is happening.',
  certainty: 'possible',
};

const BASE64_ENCRYPTION: Misconception = {
  id: 'base64-encryption',
  pattern: /\bbase ?64\b.{0,25}\b(?:encrypts?|encryption|encrypted|secure)\b/,
  correction: 'Base64 is an encoding that anyone can reverse; it provides no confidentiality.',
  certainty: 'likely',
};

const HASHING_IS_ENCRYPTION: Misconception = {
  id: 'hashing-is-encryption',
  pattern: /\bhash(?:ing)? (?:is|is a (?:type|kind|form) of) encryption\b/,
  correction: 'Hashing is one-way and cannot be decrypted; encryption is reversible with a key. Passwords are hashed with a slow, salted hash.',
  certainty: 'likely',
};

export const PROFILES: readonly TopicProfile[] = [
  {
    id: 'dsa',
    label: 'Data structures & algorithms',
    subcategories: ['dsa', 'problem-solving-explanations'],
    criteria: {
      correctness: { label: 'Algorithm correctness', description: 'The algorithm or data structure is described accurately and would produce the right answer.' },
      reasoning: { label: 'Why it works', description: 'Explains the steps in order and why they are correct (the invariant), not just what they do.' },
    },
    strongAnswer: [
      'The core idea in one sentence',
      'The steps, in order, with why they work',
      'Time and space complexity with a one-line justification',
      'One or two edge cases',
      'When you would choose a different approach',
    ],
    oneMinuteFrame: 'Idea → steps → why it is correct → complexity → edge case or alternative.',
    misconceptions: [
      {
        id: 'binary-search-unsorted',
        when: ['binary search', 'rotated', 'search'],
        pattern: /\bbinary search\b.{0,50}\b(?:works on|on an?|for) unsorted\b/,
        correction: 'Binary search needs sorted (or otherwise monotonic) input; on unsorted data use a linear scan or sort first.',
        certainty: 'likely',
      },
      {
        id: 'binary-search-no-sorting-needed',
        when: ['binary search', 'rotated', 'search'],
        pattern: new RegExp(`\\bbinary search\\b.{0,40}\\b${NOT} (?:need|require)s? .{0,15}sorted\\b`),
        correction: 'Binary search needs sorted (or otherwise monotonic) input; on unsorted data use a linear scan or sort first.',
        certainty: 'likely',
        negated: true,
      },
      {
        id: 'hash-worst-case-constant',
        when: ['hash'],
        pattern: /\bhash (?:map|table)s?\b.{0,60}\bworst case\b.{0,20}\b(?:o (?:of )?(?:1|one)|constant)\b/,
        correction: 'Hash lookups are O(1) on average; the worst case is O(n) when many keys collide.',
        certainty: 'possible',
      },
      {
        id: 'quicksort-always-nlogn',
        when: ['sort', 'quickselect', 'kth'],
        pattern: /\bquick ?sort\b.{0,50}\b(?:always|worst case (?:is )?)\b.{0,20}\bn log n\b/,
        correction: 'Quicksort averages O(n log n) but degrades to O(n^2) with consistently bad pivots; random pivots or introsort avoid that.',
        certainty: 'possible',
      },
      {
        id: 'dijkstra-negative-weights',
        when: ['dijkstra', 'shortest path', 'graph'],
        pattern: /\bdijkstra\w*\b.{0,60}\b(?:works|handles|fine|supports)\b.{0,20}\bnegative\b/,
        correction: "Dijkstra's algorithm is incorrect with negative edge weights; use Bellman-Ford.",
        certainty: 'likely',
      },
      {
        id: 'bfs-weighted-shortest-path',
        when: ['bfs', 'breadth', 'shortest path', 'graph'],
        pattern: /\b(?:bfs|breadth first search)\b.{0,50}\bshortest paths?\b.{0,30}\bweighted\b/,
        correction: 'BFS finds shortest paths only when every edge has the same weight; weighted graphs need Dijkstra or similar.',
        certainty: 'possible',
      },
    ],
  },
  {
    id: 'system-design',
    label: 'System design',
    subcategories: ['system-design'],
    criteria: {
      requirements: { label: 'Requirements and constraints', description: 'States what the system must do, the scale, and the latency, availability or consistency targets.' },
      architecture: { label: 'Components and responsibilities', description: 'Names the main components, what each one owns, and how they connect.' },
      'trade-offs': { label: 'Trade-offs', description: 'Says what the design gives up (cost, consistency, latency, complexity) and why that is acceptable.' },
    },
    strongAnswer: [
      'Clarified requirements and rough scale',
      'The main components and the request path through them',
      'How data is stored and partitioned',
      'The likely bottleneck and how to scale it',
      'What happens when a component fails',
      'At least one explicit trade-off',
    ],
    oneMinuteFrame: 'Requirements and scale → core components → request flow → bottleneck and scaling → one failure mode → one trade-off.',
    misconceptions: [
      CAP_PICK_TWO,
      EXACTLY_ONCE,
      {
        id: 'sql-cannot-scale',
        pattern: new RegExp(`\\b(?:sql|relational) (?:databases? )?${NOT} scale\\b`),
        correction:
          'Relational databases scale reads with replicas and writes with partitioning or sharding; NoSQL stores make horizontal scaling easier by giving up some features.',
        certainty: 'possible',
        negated: true,
      },
    ],
  },
  {
    id: 'cpp',
    label: 'C++',
    subcategories: ['cpp'],
    criteria: {
      correctness: { label: 'Language semantics', description: 'States what C++ actually guarantees: object lifetime, ownership, value categories, and what is undefined behaviour.' },
      terminology: { label: 'C++ terminology', description: 'Uses precise terms such as RAII, rvalue, move constructor, undefined behaviour or data race where relevant.' },
      'practical-implications': { label: 'Ownership, performance and safety', description: 'Explains the effect on resource management, copies, allocation or thread safety in real code.' },
      pitfalls: { label: 'Undefined behaviour and pitfalls', description: 'Names the mistakes that cause leaks, dangling references, races or undefined behaviour.' },
    },
    strongAnswer: [
      'What the feature guarantees, in terms of object lifetime or ownership',
      'A small code-level example',
      'The performance or safety consequence',
      'The classic pitfall and how to avoid it',
    ],
    oneMinuteFrame: 'What it is → what the language guarantees → small example → cost or benefit → pitfall.',
    misconceptions: [
      {
        id: 'std-move-moves',
        when: ['move', 'rvalue', 'forward', 'elision'],
        pattern: /\b(?:std|standard) move\b.{0,25}\b(?:moves|copies|actually moves)\b/,
        correction: 'std::move only casts to an rvalue; the move happens if a move constructor or move assignment is then selected.',
        certainty: 'possible',
      },
      {
        id: 'unique-ptr-copyable',
        pattern: /\bunique (?:ptr|pointer)s?\b.{0,30}\bcan be copied\b/,
        correction: 'unique_ptr is move-only; its copy constructor is deleted.',
        certainty: 'likely',
      },
      {
        id: 'shared-ptr-thread-safe',
        pattern: /\bshared (?:ptr|pointer)s?\b.{0,40}\b(?:is|are) (?:fully |completely )?thread safe\b/,
        correction:
          'Only the reference count is updated atomically. The pointed-to object, and concurrent writes to the same shared_ptr object, still need synchronisation.',
        certainty: 'possible',
        unless: ['reference count', 'ref count', 'control block'],
      },
      {
        id: 'volatile-thread-safe',
        pattern: /\bvolatile\b.{0,50}\b(?:thread safe|atomic|for threads|for concurrency|synchroniz\w*)\b/,
        correction: 'volatile does not make access atomic or ordered between threads in C++; use std::atomic or a mutex.',
        certainty: 'likely',
      },
      {
        id: 'reference-nullable',
        pattern: /\breferences? (?:can|could) be (?:null|nullptr|reseated|rebound)\b/,
        correction: 'A reference must be bound to an object when created and cannot be reseated; use a pointer for "maybe null".',
        certainty: 'likely',
      },
      {
        id: 'new-returns-null',
        when: ['heap', 'alloc', 'new', 'memory', 'exception'],
        pattern: /\bnew\b.{0,20}\breturns? (?:a )?(?:null|nullptr)\b/,
        correction: 'Plain new throws std::bad_alloc on failure; only new (std::nothrow) returns nullptr.',
        certainty: 'possible',
        unless: ['nothrow'],
      },
      {
        id: 'ub-always-crashes',
        pattern: /\bundefined behaviou?r\b.{0,30}\b(?:always|will|just) (?:crash|crashes|segfaults?)\b/,
        correction: 'Undefined behaviour can do anything, including appearing to work; the optimiser may assume it never happens.',
        certainty: 'likely',
      },
    ],
  },
  {
    id: 'go',
    label: 'Go',
    subcategories: ['go'],
    criteria: {
      correctness: { label: 'Go semantics', description: 'Describes how Go actually behaves: goroutines, channels, interfaces, slices and errors.' },
      terminology: { label: 'Go terminology', description: 'Uses precise terms such as goroutine, channel, select, context, interface or data race where relevant.' },
      'practical-implications': { label: 'Concurrency and resource cleanup', description: 'Covers goroutine lifetime, synchronisation, cancellation with context, and closing resources.' },
      pitfalls: { label: 'Races, leaks and pitfalls', description: 'Names the races, goroutine leaks, deadlocks or nil traps that bite in practice.' },
    },
    strongAnswer: [
      'What the feature does in Go terms',
      'A short code-level example',
      'How it behaves under concurrency (who closes, who cancels, who synchronises)',
      'The common bug and how to prevent or detect it (race detector, context, errgroup)',
    ],
    oneMinuteFrame: 'What it is → how Go implements it → small example → concurrency or cleanup rule → common bug.',
    misconceptions: [
      {
        id: 'goroutine-os-thread',
        pattern: /\bgo ?routines? (?:are|is) (?:just )?(?:os|operating system|kernel|system) threads?\b/,
        correction: 'Goroutines are scheduled by the Go runtime onto a small number of OS threads (M:N scheduling).',
        certainty: 'likely',
      },
      {
        id: 'map-concurrent-safe',
        pattern: /\bmaps? (?:are|is) (?:thread safe|safe for concurrent\w*|concurrency safe|safe to (?:use|access|write) from (?:multiple|many|several) go ?routines)\b/,
        correction: 'Built-in maps are not safe for concurrent writes; use a mutex or sync.Map.',
        certainty: 'likely',
        unless: ['sync map'],
      },
      {
        id: 'unbuffered-never-blocks',
        pattern: new RegExp(`\\bunbuffered channels?\\b.{0,30}\\b${NOT} block\\b`),
        correction: 'A send on an unbuffered channel blocks until a receiver is ready (and vice versa).',
        certainty: 'likely',
        negated: true,
      },
      {
        id: 'send-closed-channel-fine',
        pattern: /\bsend\w* (?:on|to) a closed channel\b.{0,30}\b(?:is fine|is ok|is okay|is ignored|does nothing|returns)\b/,
        correction: 'Sending on a closed channel panics. Only the sender should close, and only once.',
        certainty: 'likely',
      },
      {
        id: 'defer-end-of-block',
        pattern: /\bdefer\w*\b.{0,40}\b(?:end of the (?:block|scope|loop)|when the (?:block|scope|loop) ends)\b/,
        correction: 'Deferred calls run when the surrounding function returns, not at the end of a block or loop iteration.',
        certainty: 'likely',
      },
      {
        id: 'context-kills-goroutines',
        when: ['context', 'cancel', 'leak', 'goroutine'],
        pattern: /\bcontext\b.{0,40}\b(?:kills?|terminates?|force\w* stops?) (?:the )?go ?routines?\b/,
        correction: 'Cancelling a context only signals; each goroutine must check ctx.Done() and return on its own.',
        certainty: 'possible',
      },
    ],
  },
  {
    id: 'programming-language',
    label: 'Programming language concept',
    subcategories: ['python', 'rust', 'java', 'javascript-typescript', 'programming-languages'],
    criteria: {
      correctness: { label: 'Language semantics', description: 'Describes how the language actually behaves.' },
    },
    strongAnswer: ['What the feature is', 'How the language implements it', 'A short code-level example', 'Why it matters and the common pitfall'],
    oneMinuteFrame: 'What it is → how it works in this language → small example → why it matters → pitfall.',
    misconceptions: [],
  },
  {
    id: 'databases',
    label: 'Databases & storage',
    subcategories: ['databases-and-storage', 'data-engineering'],
    criteria: {
      correctness: { label: 'Database correctness', description: 'Claims about SQL, indexes, transactions or storage engines are accurate.' },
      mechanism: { label: 'Query execution, indexing or transactions', description: 'Explains what the database does internally: plans, index lookups, locks, MVCC, logs or replication.' },
      'trade-offs': { label: 'Consistency and performance trade-offs', description: 'Covers write cost, storage, isolation anomalies, lag or locking that the choice brings.' },
    },
    strongAnswer: [
      'What the feature is for',
      'What the database does internally to provide it',
      'A concrete query or workload example',
      'The cost: writes, storage, locking, lag or anomalies',
    ],
    oneMinuteFrame: 'Purpose → internal mechanism → example query or workload → cost and trade-off.',
    misconceptions: [
      {
        id: 'index-always-faster',
        pattern: /\bind(?:ex|exes|ices)\b.{0,30}\balways (?:make|makes|speed|speeds|improve|improves)\b/,
        correction: 'Indexes speed up reads that match them, but slow down writes and use space; the planner may also choose not to use them.',
        certainty: 'possible',
      },
      {
        id: 'nosql-no-transactions',
        pattern: new RegExp(`\\b(?:nosql|no sql|no sequel)\\b.{0,30}\\b(?:${NOT}|has no|have no|no) (?:support )?(?:any )?(?:transactions?|acid)\\b`),
        correction: 'Many NoSQL databases (MongoDB, DynamoDB, FoundationDB…) support transactions; the scope and cost differ by system.',
        certainty: 'possible',
        negated: true,
      },
      {
        id: 'serializable-runs-serially',
        pattern: /\bserializable\b.{0,50}\b(?:one at a time|one after another|serially|sequentially)\b/,
        correction: 'Serializable means the result equals some serial order; databases still run the transactions concurrently.',
        certainty: 'possible',
        unless: ['equivalent', 'as if', 'same result', 'same outcome'],
      },
      {
        id: 'acid-c-is-cap-c',
        pattern: /\b(?:the )?(?:c|consistency) in acid\b.{0,40}\b(?:replicas?|all nodes|cap)\b/,
        correction: 'Consistency in ACID means the data obeys its invariants and constraints; it is not the replica agreement of CAP.',
        certainty: 'possible',
      },
    ],
  },
  {
    id: 'networking',
    label: 'Networking',
    subcategories: ['networking'],
    criteria: {
      mechanism: { label: 'Protocol behaviour', description: 'Explains what the protocol actually does on the wire: handshakes, packets, retransmission, caching or resolution.' },
      'trade-offs': { label: 'Latency, reliability and failure handling', description: 'Covers round trips, loss, timeouts and what happens when something fails.' },
    },
    strongAnswer: [
      'Which layer and protocol is involved',
      'The sequence of messages or steps',
      'The latency or reliability effect',
      'What happens on failure (loss, timeout, misconfiguration)',
    ],
    oneMinuteFrame: 'Layer and purpose → message sequence → effect on latency or reliability → failure case.',
    misconceptions: [
      {
        id: 'tcp-guarantees-delivery',
        pattern: /\btcp\b.{0,30}\bguarantees? (?:the )?delivery\b/,
        correction:
          'TCP retransmits and orders data, but it cannot guarantee delivery if the network or peer fails; it reports the failure instead. "Reliable, in-order byte stream" is more precise.',
        certainty: 'possible',
      },
      {
        id: 'dns-only-udp',
        pattern: /\bdns\b.{0,30}\bonly (?:uses )?udp\b/,
        correction: 'DNS mostly uses UDP but falls back to TCP for large responses and zone transfers; DNS over TLS and HTTPS use TCP or QUIC.',
        certainty: 'likely',
      },
      {
        id: 'http2-no-hol',
        pattern: /\bhttp ?(?:2|two)\b.{0,50}\b(?:solves|fixes|eliminates|removes)\b.{0,20}\bhead of line\b/,
        correction: 'HTTP/2 removes HTTP-level head-of-line blocking, but a lost TCP packet still stalls every stream; HTTP/3 over QUIC fixes that.',
        certainty: 'possible',
        unless: ['tcp level', 'still', 'http 3', 'quic'],
      },
      {
        id: 'https-hides-hostname',
        when: ['tls', 'https', 'url', 'dns'],
        pattern: /\bhttps\b.{0,40}\b(?:hides|encrypts)\b.{0,20}\b(?:domain|hostname|which (?:site|website))\b/,
        correction: 'The hostname is usually visible through DNS and the TLS SNI field unless Encrypted Client Hello is used; the path and contents are encrypted.',
        certainty: 'possible',
      },
    ],
  },
  {
    id: 'operating-systems',
    label: 'Operating systems & concurrency',
    subcategories: ['operating-systems'],
    criteria: {
      mechanism: { label: 'Kernel and hardware mechanism', description: 'Explains what the kernel or hardware does: scheduling, page tables, interrupts, system calls or caches.' },
      'trade-offs': { label: 'Concurrency and performance costs', description: 'Covers context switches, contention, faults, latency or isolation costs.' },
    },
    strongAnswer: [
      'What the abstraction provides',
      'What the kernel or hardware does to provide it',
      'A concrete scenario where it matters',
      'The cost or failure mode',
    ],
    oneMinuteFrame: 'Abstraction → kernel or hardware mechanism → concrete scenario → cost or failure mode.',
    misconceptions: [
      {
        id: 'threads-own-memory',
        pattern: /\bthreads?\b.{0,30}\b(?:have|has|get) (?:their own|its own|separate) (?:address space|memory space|heap)\b/,
        correction: 'Threads of one process share the address space and heap; each thread has its own stack and registers.',
        certainty: 'likely',
      },
      {
        id: 'processes-share-memory',
        pattern: /\bprocesses (?:share|have the same) (?:the )?(?:memory|address space)\b/,
        correction: 'Each process has its own virtual address space; sharing needs explicit mechanisms such as shared memory or mmap.',
        certainty: 'likely',
        unless: ['shared memory', 'copy on write', 'fork'],
      },
      {
        id: 'virtual-memory-is-swap',
        pattern: /\bvirtual memory\b.{0,20}\b(?:is|means|just means) (?:the )?(?:swap|disk|using the disk)\b/,
        correction: 'Virtual memory is per-process address translation through page tables; swapping to disk is only one thing it enables.',
        certainty: 'possible',
      },
    ],
  },
  {
    id: 'distributed-backend',
    label: 'Backend & distributed systems',
    subcategories: ['distributed-systems', 'backend-engineering', 'cloud-and-devops', 'software-architecture', 'performance-engineering'],
    criteria: {
      mechanism: { label: 'Coordination and runtime mechanism', description: 'Explains how the components coordinate: messages, quorums, retries, leases, queues or replication.' },
      'trade-offs': { label: 'Failure modes and trade-offs', description: 'Covers partial failure, consistency, latency, cost and operational complexity.' },
    },
    strongAnswer: [
      'The problem the technique solves',
      'How it works across machines or services',
      'A realistic failure scenario',
      'The consistency, latency or complexity trade-off',
    ],
    oneMinuteFrame: 'Problem → mechanism across nodes → failure scenario → trade-off.',
    misconceptions: [
      EXACTLY_ONCE,
      CAP_PICK_TWO,
      {
        id: 'two-phase-commit-nonblocking',
        pattern: new RegExp(`\\b(?:two phase commit|2pc)\\b.{0,40}\\b(?:${NOT}|no) block(?:s|ing)?\\b`),
        correction: 'Two-phase commit blocks: prepared participants must hold locks until the coordinator\'s decision arrives.',
        certainty: 'likely',
        negated: true,
      },
      {
        id: 'consensus-needs-all-nodes',
        pattern: /\b(?:raft|paxos|consensus)\b.{0,40}\b(?:all|every) (?:nodes?|replicas?|servers?) (?:to agree|must agree|need to agree|have to agree)\b/,
        correction: 'Consensus needs a majority (quorum) of nodes, not all of them, which is how it tolerates failures.',
        certainty: 'likely',
      },
      {
        id: 'retries-always-safe',
        pattern: /\bretr(?:y|ies|ying)\b.{0,30}\b(?:is|are)? ?always safe\b/,
        correction: 'Retries are safe only for idempotent operations, or with idempotency keys and deduplication.',
        certainty: 'possible',
      },
    ],
  },
  {
    id: 'api-design',
    label: 'API design',
    subcategories: ['api-design'],
    criteria: {
      mechanism: { label: 'HTTP and API semantics', description: 'Uses methods, status codes, headers and payloads according to their defined meaning.' },
      'trade-offs': { label: 'Compatibility, safety and client impact', description: 'Covers what clients experience: breaking changes, retries, caching, security and cost.' },
    },
    strongAnswer: [
      'What problem the API pattern solves for clients',
      'The concrete request and response shape',
      'Failure, retry or compatibility behaviour',
      'The trade-off for clients and servers',
    ],
    oneMinuteFrame: 'Client problem → request and response design → failure or retry behaviour → trade-off.',
    misconceptions: [
      {
        id: 'post-idempotent',
        pattern: /\bpost\b.{0,15}\b(?:is|are|requests are) idempotent\b/,
        correction: 'POST is not idempotent by definition; repeating it can create duplicates unless you add an idempotency key.',
        certainty: 'likely',
      },
      {
        id: 'put-not-idempotent',
        pattern: /\bput\b.{0,15}\b(?:is not|isnt|are not|arent) idempotent\b/,
        correction: 'PUT is idempotent: sending the same full representation twice leaves the same state.',
        certainty: 'likely',
        negated: true,
      },
      {
        id: '401-forbidden',
        pattern: /\b401\b.{0,20}\b(?:means )?(?:forbidden|not allowed|no permission)\b/,
        correction: '401 means not authenticated (missing or invalid credentials); 403 means authenticated but not allowed.',
        certainty: 'likely',
      },
      {
        id: 'jwt-encrypted',
        pattern: /\bjwts?\b.{0,30}\b(?:is|are) encrypted\b/,
        correction: 'A standard JWT is signed, not encrypted, so anyone holding it can read the payload; JWE is the encrypted variant.',
        certainty: 'possible',
        unless: ['jwe'],
      },
      {
        id: 'cors-protects-server',
        pattern: /\bcors\b.{0,40}\b(?:protects?|secures?) (?:the |your )?(?:server|api|backend)\b/,
        correction: 'CORS is enforced by browsers to protect users\' data; it does not stop non-browser clients from calling your API.',
        certainty: 'possible',
      },
    ],
  },
  {
    id: 'frontend',
    label: 'Frontend & browser',
    subcategories: ['frontend-engineering'],
    criteria: {
      mechanism: { label: 'Browser and rendering mechanism', description: 'Explains what the browser or framework does: parsing, layout, paint, reconciliation, caching or the event loop.' },
      'trade-offs': { label: 'Performance and UX trade-offs', description: 'Covers load time, interactivity, accessibility, SEO or complexity costs.' },
    },
    strongAnswer: ['What the technique is for', 'What the browser or framework does', 'A concrete UI example', 'The performance or UX trade-off'],
    oneMinuteFrame: 'Purpose → browser or framework mechanism → UI example → trade-off.',
    misconceptions: [
      {
        id: 'virtual-dom-faster',
        pattern: /\bvirtual dom\b.{0,20}\b(?:is|makes \w+) (?:always )?faster\b/,
        correction: 'The virtual DOM is not inherently faster than direct DOM updates; it makes declarative updates efficient enough through diffing and batching.',
        certainty: 'possible',
      },
      {
        id: 'local-storage-secure-tokens',
        pattern: /\blocal ?storage\b.{0,30}\b(?:is )?(?:secure|safe) (?:for|to store) (?:tokens?|passwords?|secrets?)\b/,
        correction: 'Anything in localStorage is readable by any script on the page, so an XSS bug exposes it; httpOnly cookies avoid that.',
        certainty: 'possible',
      },
    ],
  },
  {
    id: 'ai-ml',
    label: 'AI & machine learning',
    subcategories: ['ai-ml', 'genai-llms'],
    criteria: {
      correctness: { label: 'Model fundamentals', description: 'Describes the model, objective or algorithm accurately.' },
      mechanism: { label: 'Training, inference or evaluation mechanism', description: 'Explains how the model learns, generates or is measured, not only what it is called.' },
      'trade-offs': { label: 'Limitations and data quality', description: 'Covers data quality, evaluation pitfalls, cost, bias or failure modes.' },
    },
    strongAnswer: [
      'What the method does and the problem it solves',
      'How it is trained or how it produces outputs',
      'How you would evaluate it',
      'Its limitations: data, bias, cost or failure modes',
    ],
    oneMinuteFrame: 'Problem → how it works (training or inference) → how to evaluate → limitation.',
    misconceptions: [
      {
        id: 'accuracy-always-enough',
        when: ['imbalanc', 'metric', 'precision', 'recall', 'fraud', 'evaluat'],
        pattern: /\baccuracy is (?:always|the best|enough|all you need)\b/,
        correction: 'With imbalanced classes accuracy is misleading; use precision, recall, F1 or PR-AUC and pick the threshold from business costs.',
        certainty: 'possible',
      },
      {
        id: 'overfitting-high-training-error',
        pattern: /\boverfitting\b.{0,40}\b(?:high|large) training (?:error|loss)\b/,
        correction: 'Overfitting shows low training error with high validation error; high training error indicates underfitting.',
        certainty: 'likely',
      },
      {
        id: 'llm-looks-up-database',
        pattern: /\b(?:llms?|language models?)\b.{0,40}\b(?:looks? up|search(?:es)?|quer(?:y|ies)|retrieves?)\b.{0,20}\b(?:database|the internet|google)\b/,
        correction:
          'A plain language model generates text from patterns in its weights; it only looks things up when the application adds retrieval or tools.',
        certainty: 'possible',
        unless: ['rag', 'retrieval augmented', 'tool', 'browsing', 'plugin'],
      },
      {
        id: 'tune-on-test-set',
        pattern: /\b(?:tune|tuning|choose|choosing|pick|picking) .{0,30}\bon the test set\b/,
        correction: 'Tune on a validation set or with cross-validation; the test set is used once for the final estimate.',
        certainty: 'possible',
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    subcategories: ['security'],
    criteria: {
      mechanism: { label: 'Attack and defence mechanism', description: 'Explains how the attack works and how the defence stops it.' },
      'trade-offs': { label: 'Residual risk and trade-offs', description: 'Covers what the defence does not stop, and its usability or performance cost.' },
    },
    strongAnswer: ['The threat and who the attacker is', 'How the attack works step by step', 'The defence and why it works', 'What risk remains'],
    oneMinuteFrame: 'Threat → how the attack works → defence → remaining risk.',
    misconceptions: [BASE64_ENCRYPTION, HASHING_IS_ENCRYPTION],
  },
  {
    id: 'general-technical',
    label: 'Engineering concept',
    subcategories: ['testing-and-quality-engineering', 'compilers-and-build-systems', 'developer-tools'],
    criteria: {},
    strongAnswer: ['A one-sentence definition', 'How it works', 'A concrete example', 'A trade-off or limitation'],
    oneMinuteFrame: 'Definition → how it works → example → trade-off.',
    misconceptions: [BASE64_ENCRYPTION, HASHING_IS_ENCRYPTION],
  },
  {
    id: 'general',
    label: 'General explanation',
    subcategories: [],
    criteria: {},
    strongAnswer: ['A clear opening that answers the question', 'Two or three key points in order', 'An example or analogy', 'A one-line conclusion'],
    oneMinuteFrame: 'Answer in one sentence → two or three points → example → conclusion.',
    misconceptions: [],
  },
];
