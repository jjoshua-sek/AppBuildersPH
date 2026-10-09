#!/usr/bin/env bash
# Copies the two models onto a connected Android phone (Infinix / Tecno).
# Install and open the app once first, so its folder exists and belongs to it.
#   scripts/push-models.sh path/to/llm-q4_0.gguf path/to/arctic-embed-xs.gguf [device-serial]
set -euo pipefail
LLM="${1:?path to LLM .gguf (Q4_0)}"
EMB="${2:?path to embedder .gguf}"
ADB=(adb)
if [ -n "${3:-}" ]; then ADB=(adb -s "$3"); fi

PKG=com.backpacktutor
DIR=/sdcard/Android/data/$PKG/files/models
"${ADB[@]}" shell mkdir -p "$DIR"
"${ADB[@]}" push "$LLM" "$DIR/gen.gguf"
"${ADB[@]}" push "$EMB" "$DIR/emb.gguf"
"${ADB[@]}" shell ls -l "$DIR"

echo
echo "Pushed. Record these in DISCLOSURES.md:"
if command -v sha256sum >/dev/null; then sha256sum "$LLM" "$EMB"; else shasum -a 256 "$LLM" "$EMB"; fi
