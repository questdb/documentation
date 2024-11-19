#!/bin/bash

# Check if directory path argument is provided
if [ $# -eq 0 ]
  then
    echo "No directory path provided"
    exit 1
fi

# Directory path
dir=$1

# Loop over all .mdx files in the directory
for file in $dir/*.mdx
do
  # Use sed to delete the lines in-place
  sed -i '' '/import Banner from "@theme\/Banner"/d' $file
  sed -i '' '/import Screenshot from "@theme\/Screenshot"/d' $file
done