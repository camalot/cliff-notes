#!/usr/bin/env bash

WIDTH=128
PATTERN=""
FILES=()
OVERWRITE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --width=*|-w=*) WIDTH="${1#*=}"; shift ;;
    --width|-w) WIDTH="$2"; shift 2 ;;
    --pattern=*|-p=*) PATTERN="${1#*=}"; shift ;;
    --pattern|-p) PATTERN="$2"; shift 2 ;;
    --overwrite|-o) OVERWRITE=true; shift ;;
    -*) echo "Unknown option: $1"; exit 1 ;;
    *) FILES+=("$1"); shift ;;
  esac
done

# Enable globstar for ** support
shopt -s globstar 2>/dev/null

# If explicit files were passed as args, use them; otherwise expand PATTERN
if [[ ${#FILES[@]} -gt 0 ]]; then
  file_list=("${FILES[@]}")
else
  file_list=("${PATTERN:-"../resources/icons/**/*.svg"}")
fi

for file in "${file_list[@]}"; do
  [[ -f "$file" ]] || continue
  dir=$(dirname "$file")
  base=$(basename "$file" .svg)
  png_path="$dir/$base.png"

  if [[ "$OVERWRITE" == false && -f "$png_path" ]]; then
    echo "Skipping $png_path as it already exists."
    continue
  fi

  echo "Converting $file to PNG with width $WIDTH -> $png_path"
  magick -density 300 -background none "msvg:$file" -resize "${WIDTH}x" "$png_path"
done
