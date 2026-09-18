// Migrated from the user's MIT-derived Job Application Copilot scoring bundle.
// Keep this compatibility policy deterministic while native Job Harness matching evolves.
export const LEGACY_COPILOT_SCORING = {
  "ai-agent-app": {
    "titleBlockKeywords": {
      "算法工程师": 80,
      "算法研究": 80,
      "算法研究员": 80,
      "研究员": 60,
      "算法训练": 70,
      "模型训练": 70,
      "模型研发": 60,
      "C++底层": 55,
      "销售": 80,
      "运营": 70
    },
    "titleStrongKeywords": {
      "AI Agent": 42,
      "智能体": 42,
      "大模型应用": 40,
      "Agent开发": 42,
      "LLM应用": 36,
      "AI应用工程师": 40,
      "AI应用开发": 42,
      "大模型应用开发": 42,
      "Agent工程师": 40,
      "AI技术开发": 42
    },
    "titleMediumKeywords": {
      "AI开发": 26,
      "AI应用研发": 30,
      "AI技术": 22,
      "DIFY": 24,
      "Python开发": 14,
      "全栈开发": 10
    },
    "detailStrongKeywords": {
      "LangGraph": 12,
      "RAG": 12,
      "DIFY": 12,
      "MCP": 10,
      "Function Calling": 10,
      "Tool Use": 10,
      "工具调用": 10,
      "Agent": 8,
      "智能体": 8,
      "AI工作流": 8,
      "工作流": 6,
      "LangChain": 8,
      "LlamaIndex": 8,
      "Prompt Engineering": 8,
      "Claude Code": 7,
      "Codex": 7,
      "Cursor": 5,
      "LLM": 6,
      "大模型": 6,
      "FastAPI": 9,
      "pgvector": 9,
      "向量检索": 9,
      "checkpoint": 8,
      "interrupt": 8,
      "HITL": 8,
      "Context Engineering": 10,
      "上下文工程": 10,
      "Eval": 8,
      "评测": 8
    },
    "detailSupportKeywords": {
      "Python": 5,
      "PostgreSQL": 4,
      "Redis": 3,
      "SSE": 5,
      "Docker": 3,
      "React": 3,
      "TypeScript": 3
    },
    "detailBlockKeywords": {
      "Java研发经验": 80,
      "Java开发经验": 80,
      "Java后端": 80,
      "C++研发经验": 80,
      "C++开发经验": 80
    },
    "detailNegativeKeywords": {
      "CUDA": 22,
      "PyTorch训练": 24,
      "PyTorch": 8,
      "TensorFlow": 8,
      "分布式训练": 24,
      "强化学习": 18,
      "算法迭代": 12,
      "模型微调": 12,
      "RLHF": 18,
      "LoRA微调": 15
    },
    "comboBonuses": [
      {
        "keywords": [
          "LangGraph",
          "RAG"
        ],
        "score": 10
      },
      {
        "keywords": [
          "工具调用",
          "HITL"
        ],
        "score": 8
      },
      {
        "keywords": [
          "FastAPI",
          "PostgreSQL"
        ],
        "score": 6
      }
    ]
  },
  "ai-frontend": {
    "titleBlockKeywords": {
      "Android": 45,
      "iOS": 45,
      "C++": 40,
      "销售": 80,
      "运营": 70
    },
    "titleStrongKeywords": {
      "AI前端": 34,
      "前端开发": 30,
      "Web前端": 28,
      "React开发": 26,
      "Vue开发": 26,
      "前端工程师": 30
    },
    "titleMediumKeywords": {
      "AI应用": 15,
      "全栈开发": 8
    },
    "detailStrongKeywords": {
      "TypeScript": 10,
      "React": 10,
      "Vue3": 10,
      "Vue": 8,
      "SSE": 9,
      "WebSocket": 8,
      "AI Workbench": 10,
      "流式": 8,
      "tool call": 8,
      "工具调用": 8,
      "citation": 7,
      "引用": 6,
      "TanStack Query": 9,
      "Zustand": 7,
      "Playwright": 7
    },
    "detailSupportKeywords": {
      "JavaScript": 5,
      "HTML": 4,
      "CSS": 4,
      "Vite": 4,
      "Vitest": 4,
      "Electron": 4,
      "Server State": 5,
      "性能优化": 4
    },
    "detailNegativeKeywords": {
      "Java后端": 16,
      "Spring Cloud": 18,
      "CUDA": 24,
      "模型训练": 24
    },
    "comboBonuses": [
      {
        "keywords": [
          "React",
          "TypeScript"
        ],
        "score": 8
      },
      {
        "keywords": [
          "SSE",
          "AI"
        ],
        "score": 8
      },
      {
        "keywords": [
          "TanStack Query",
          "Server State"
        ],
        "score": 7
      }
    ]
  },
  "ai-fullstack": {
    "titleBlockKeywords": {
      "销售": 80,
      "运营": 70,
      "算法训练": 45,
      "嵌入式": 40
    },
    "titleStrongKeywords": {
      "AI全栈": 34,
      "全栈开发": 30,
      "Full Stack": 30,
      "Fullstack": 30,
      "AI应用工程师": 26,
      "AI开发工程师": 24
    },
    "titleMediumKeywords": {
      "后端开发": 12,
      "前端开发": 12,
      "Python开发": 12,
      "Go开发": 12
    },
    "detailStrongKeywords": {
      "React": 8,
      "Vue": 8,
      "TypeScript": 8,
      "Node.js": 8,
      "Express": 7,
      "Go": 8,
      "Gin": 7,
      "Python": 8,
      "FastAPI": 8,
      "PostgreSQL": 7,
      "Redis": 6,
      "Prisma": 7,
      "Docker": 6,
      "LangGraph": 8,
      "RAG": 8,
      "SSE": 7
    },
    "detailSupportKeywords": {
      "REST API": 5,
      "GitHub Actions": 5,
      "CI/CD": 5,
      "Playwright": 4,
      "OpenTelemetry": 4,
      "Nx": 4,
      "pnpm": 3,
      "Electron": 3
    },
    "detailBlockKeywords": {
      "Java研发经验": 80,
      "Java开发经验": 80,
      "Java后端": 80,
      "C++研发经验": 80,
      "C++开发经验": 80
    },
    "detailNegativeKeywords": {
      "CUDA": 18,
      "分布式训练": 20,
      "内核开发": 20
    },
    "comboBonuses": [
      {
        "keywords": [
          "React",
          "FastAPI"
        ],
        "score": 6
      },
      {
        "keywords": [
          "TypeScript",
          "PostgreSQL"
        ],
        "score": 5
      },
      {
        "keywords": [
          "LangGraph",
          "RAG"
        ],
        "score": 7
      },
      {
        "keywords": [
          "Docker",
          "CI/CD"
        ],
        "score": 5
      }
    ]
  }
} as const;
