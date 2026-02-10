#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"

if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "Bundle directory not found: $BUNDLE_DIR" >&2
  exit 1
fi

copy_latest() {
  local pattern="$1"
  local label="$2"
  local latest
  latest=$(ls -t $pattern 2>/dev/null | head -n 1 || true)
  if [[ -n "$latest" ]]; then
    cp -R "$latest" "$ROOT_DIR/"
    echo "Copied $label: $(basename "$latest")"
  fi
}

# macOS artifacts
copy_latest "$BUNDLE_DIR/macos/*.dmg" "macOS dmg"
if [[ -d "$BUNDLE_DIR/macos/Studioklocka.app" ]]; then
  cp -R "$BUNDLE_DIR/macos/Studioklocka.app" "$ROOT_DIR/"
  echo "Copied macOS app: Studioklocka.app"
fi

# Windows artifacts (only when built on Windows)
copy_latest "$BUNDLE_DIR/msi/*.msi" "Windows msi"
copy_latest "$BUNDLE_DIR/nsis/*.exe" "Windows exe"

# Linux artifacts (optional)
copy_latest "$BUNDLE_DIR/deb/*.deb" "Linux deb"
copy_latest "$BUNDLE_DIR/appimage/*.AppImage" "Linux AppImage"
