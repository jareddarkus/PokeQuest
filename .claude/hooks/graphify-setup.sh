#!/usr/bin/env bash
# SessionStart hook: make sure graphify is installed and the code graph is fresh.
# Cloud sessions start from a blank container, so this reinstalls (a few seconds) and rebuilds (~6 s, no LLM, no cost).
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
if ! command -v graphify >/dev/null 2>&1; then
  $PY -m pip install -q graphifyy >/dev/null 2>&1 || pip install -q graphifyy >/dev/null 2>&1 || { echo "graphify: could not install (pip install graphifyy). Fall back to grep."; exit 0; }
fi
[ -f "$HOME/.claude/skills/graphify/SKILL.md" ] || graphify install >/dev/null 2>&1
if graphify update . >/dev/null 2>&1; then
  echo "graphify ready: $($PY -c "import json;d=json.load(open('graphify-out/graph.json'));print(len(d['nodes']),'nodes,',len(d.get('links',d.get('edges',[]))),'edges')" 2>/dev/null). Use 'graphify query/explain/path/affected' BEFORE grep. Load the 'pokequest' skill for the workflow."
else
  echo "graphify installed but graph build failed; run 'graphify update .' manually. Fall back to grep."
fi
exit 0
