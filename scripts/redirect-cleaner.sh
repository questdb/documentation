#!/bin/bash

# This partially works and needs a lot of functionality
# But it's a start. Run it in docs, blog & src/pages.
# Then assess the commits to see whether the changes are correct.
# !! Do not trust the script alone. !!
# Written for MacOS, Sed behaviour may differ on Linux
# ./redirect-cleaner.sh [config_file] [content_dir]
# Example: ./redirect-cleaner.sh netlify.toml docs

# Requires toml parser and pretty printer
# brew install yj jq

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <config_file> <content_dir>"
  exit 1
fi

config_file="$1"
content_dir="$2"

redirects=$(yj -t < "$config_file" | jq '.redirects')

len=$(echo "$redirects" | jq '. | length')
for ((i = 0; i < len; i++)); do
  from=$(echo "$redirects" | jq -r ".[$i].from")
  to=$(echo "$redirects" | jq -r ".[$i].to")

  if [ ! -z "$from" ] && [ ! -z "$to" ]; then
    grep -rlE "$from" "$content_dir" | while read -r file_path; do
      if [[ $file_path == *.md || $file_path == *.mdx ]]; then
        sed -i '' "s|$from|$to|g" "$file_path"
      fi
    done
  fi
done

echo "Redirects identified! Audit prior to commit. 🧹"
