#!/bin/sh

# This file is a commit hook
# It checks that files files to be commited are not over 10MB

# Redirect output to stderr.
exec 1>&2

CURRENT_DIR="$(pwd)"
HAS_ERROR=""

for file in $(git diff --cached --name-only | sort | uniq); do
	file_size=$(du -m $CURRENT_DIR/$file | awk '{print $1}')
	if [ "$file_size" -ge 10 ]; then
		echo "$file is over 10MB."
		HAS_ERROR="1"
	fi
done

if [ "$HAS_ERROR" != "" ]; then
    echo "Can't commit, fix errors first." >&2
    exit 1
fi

exit 0
