# Project Context


## Multi Brain Startup

This project uses `.multibrain/` as shared working memory across coding agents (Claude Code, OpenCode, Codex). Before starting any task, read `.multibrain/session.md` to scan the master index, then open relevant topic bucket(s) in `.multibrain/indexes/`. If an entry points to a context file (`-> .multibrain/context/...`), read it for full handoff details. After completing work, append a one-line entry to the relevant bucket (newest first) with timestamp, your agent name, and a one-sentence summary. For complex tasks, create a context file in `.multibrain/context/` using YYYY-MM-DD-HHMM-agent-topic.md naming with sections: Goal, Summary, Changes, Files, Verification, Follow-up. Keep session.md scannable in under one minute. Facts over prose. Relative paths only. Soft cap 25 entries per bucket — summarize when exceeded.

