#!/bin/bash

# Check if directory path argument is provided
if [ $# -eq 0 ]; then
    echo "No directory provided. Usage: ./webp-converter.sh /path/to/directory"
    exit 1
fi

# Directory containing the .png files
DIR=$1

# Loop through each .png file in the directory and its subdirectories
find "$DIR" -name "*.png" | while read FILE; do
  # Get the file name without the extension
  NAME=$(basename "$FILE" .png)

  # Get the directory of the file
  FILEDIR=$(dirname "$FILE")

  # Check if the .webp file already exists
  if [ ! -f "$FILEDIR/$NAME.webp" ]; then
    # Convert the .png file to .webp
    cwebp -q 100 "$FILE" -o "$FILEDIR/$NAME.webp"
  fi

  # Delete the original .png file
  rm "$FILE"
done