---
name: find-skills
description: Discovers, lists, and installs Agent Skills for Cursor projects and personal skill directories. Use when the user asks to find skills, list available skills, install a skill, or asks what skills exist for a task.
---

# Find Skills

帮助**发现、列举、安装** Cursor Agent Skills，避免重复造轮子。

## 何时使用

- 用户问「有没有 XX 相关的 skill」
- 列举当前可用 skills
- 安装/复制 skill 到项目或个人目录
- 新任务开始前确认是否已有 skill 覆盖

## Skill 存放位置

| 类型 | 路径 | 作用域 |
|------|------|--------|
| **项目** | `.cursor/skills/<name>/SKILL.md` | 当前仓库，可提交 Git |
| **个人** | `~/.cursor/skills/<name>/SKILL.md` | 所有项目 |
| **内置** | `~/.cursor/skills-cursor/` | Cursor 系统管理，**勿在此创建** |

Agent 启动时通过 `available_skills` 列表匹配 `description` 决定是否读取。

## 发现流程

### 1. 列举本项目 skills

```bash
ls -la .cursor/skills/
# 或
find .cursor/skills -name 'SKILL.md'
```

### 2. 列举个人 skills

```bash
ls -la ~/.cursor/skills/ 2>/dev/null
```

### 3. 按任务关键词匹配

读取各 `SKILL.md` frontmatter 的 `description`，匹配用户意图：

| 用户意图 | 优先 skill |
|----------|------------|
| 调 LLM API / FastAPI | `llm-api-engineering` |
| Vercel AI SDK / useChat | `vercel-ai-sdk-fullstack` |
| 界面好看 / 去 AI 味 | `frontend-design`、`design-taste-frontend` |
| 对话面板 / Patch 确认 | `ai-chat-ui` |
| 创建新 skill | `create-skill`（`~/.cursor/skills-cursor/`） |

### 4. 外部 skill 源（可选）

- Cursor 官方技能创建指南：`~/.cursor/skills-cursor/create-skill/SKILL.md`
- Codex 精选列表：`https://github.com/openai/skills/tree/main/skills/.curated`（可用 skill-installer 脚本，路径 `$CODEX_HOME/skills`）

## 安装 skill 到本项目

```bash
# 手动：复制目录
mkdir -p .cursor/skills/my-skill
# 写入 SKILL.md（含 name + description frontmatter）

# 从另一项目复制
cp -r /path/to/other/.cursor/skills/foo .cursor/skills/
```

**必须包含**：

```markdown
---
name: my-skill
description: Third person. WHAT + WHEN trigger terms.
---
```

`name`：小写、连字符、≤64 字符。`description`：第三人称，含触发词。

## 本项目已安装 skills

```
.cursor/skills/
├── frontend-design/       # 大胆前端方向
├── llm-api-engineering/   # LLM 后端工程化
├── vercel-ai-sdk-fullstack/
├── design-taste-frontend/ # UI 品味精修
├── ai-chat-ui/            # 对话界面
└── find-skills/           # 本 skill
```

安装或更新 skill 后，**新开 Agent 对话**或重载窗口以刷新 `available_skills`。

## 何时创建新 skill vs 用现有

| 情况 | 行动 |
|------|------|
| 一次性小改 | 不写 skill |
| 重复 3+ 次的团队规范 | 写项目 skill |
| 跨项目通用能力 | 写 `~/.cursor/skills/` |
| 已有 80% 覆盖 | 扩展现有 skill，不新建 |

## 输出格式（列举时）

```markdown
## 可用 Skills

1. **llm-api-engineering** — LLM API、结构化输出、SSE
2. **ai-chat-ui** — 对话面板、Patch 确认卡
...

需要我为当前任务读取哪一个？
```

## 反模式

- ❌ 在 `~/.cursor/skills-cursor/` 下新建（会被系统覆盖）
- ❌ 只有 body 无 frontmatter `description`（无法被自动发现）
- ❌ description 写「我可以帮你…」（应用第三人称）
