# Execute this script from the documentation root (the default search path is '.'):
#     python src/validate_queries.py
#
# You can specify a different starting path using:
#     --path <directory>
#
# By default, queries execute against localhost:9000.
# You can use --url to target a different QuestDB instance, for example:
#     --url https://demo.questdb.io
#
# The script executes all QuestDB demo queries found in Markdown files and reports their execution times.
# Queries taking more than 1 second appear in yellow.
# Failing queries appear with a red ❌ icon and are summarized at the end.
#
# Two files are generated:
#   • all_queries.sql   → all executed queries
#   • failed_queries.sql → only the queries that failed

import re
import requests
from pathlib import Path
import sys
import json
import argparse

# ---------------- Argument parsing ----------------
parser = argparse.ArgumentParser(
    description="Execute all QuestDB demo SQL queries found in Markdown files."
)
parser.add_argument(
    "--path",
    default=".",
    help="Root folder to search for .md and .mdx files (default: current directory)",
)
parser.add_argument(
    "--url",
    default="http://localhost:9000",
    help="QuestDB REST API base URL, e.g. http://localhost:9000 (default: localhost)",
)
args = parser.parse_args()

# ---------------- Configuration ----------------
QUESTDB_REST_URL = f"{args.url.rstrip('/')}/exec"
ROOT_DIR = args.path
ALL_FILE = Path("all_queries.sql")
FAILED_FILE = Path("failed_queries.sql")
TIMEOUT = (3, 60)  # (connect timeout, read timeout)

# ANSI color escape codes
YELLOW = "\033[93m"
RESET = "\033[0m"

block_re = re.compile(
    r"```questdb-sql[^\n]*title=\"([^\"]+)\"[^\n]*\bdemo\b[^\n]*\n(.*?)```",
    re.DOTALL,
)

def extract_blocks(root_dir):
    root = Path(root_dir)
    for ext in ("*.md", "*.mdx"):
        for path in root.rglob(ext):
            text = path.read_text(encoding="utf-8", errors="ignore")
            for match in block_re.finditer(text):
                title, sql = match.groups()
                yield path, title.strip(), sql.strip()

def execute_query(query):
    """Execute the query via GET, reading full response and parsing timings."""
    try:
        r = requests.get(
            QUESTDB_REST_URL,
            params={"query": query, "timings": "true"},
            timeout=TIMEOUT,
        )
        text = r.text.strip()

        if r.status_code != 200:
            try:
                js = json.loads(text)
                if "error" in js:
                    return False, js["error"], None
            except Exception:
                pass
            return False, f"HTTP {r.status_code} {r.reason}: {text or 'No body'}", None

        if not text:
            return True, None, None

        try:
            js = json.loads(text)
            if "error" in js:
                return False, js["error"], None
            exec_time = js.get("timings", {}).get("execute")
            return True, None, exec_time
        except json.JSONDecodeError:
            # Rare: malformed JSON; still treat as success
            return True, None, None

    except requests.Timeout:
        return False, f"Timeout after {TIMEOUT[1]}s", None
    except Exception as e:
        return False, str(e), None

if __name__ == "__main__":
    success = 0
    failed = 0
    failed_list = []
    blocks = list(extract_blocks(ROOT_DIR))
    total = len(blocks)

    print(f"QuestDB REST URL: {QUESTDB_REST_URL}")
    print(f"Searching in: {Path(ROOT_DIR).resolve()}")
    print(f"Found {total} queries to execute.\n")

    with ALL_FILE.open("w", encoding="utf-8") as all_out, FAILED_FILE.open("w", encoding="utf-8") as fail_out:
        for i, (file_path, title, sql) in enumerate(blocks, 1):
            print(f"[{i}/{total}] Executing: {file_path}  [{title}]")
            sys.stdout.flush()

            ok, err, exec_time = execute_query(sql)
            all_out.write(f"-- {file_path}\n--- {title}\n{sql}\n\n")

            if ok:
                success += 1
                if exec_time is not None:
                    exec_ms = exec_time / 1_000_000
                    if exec_ms >= 1000:
                        # Over 1s: highlight with color or symbol
                        try:
                            print(f"   {YELLOW}⚠️  Success (execute: {exec_ms:.3f} ms){RESET}")
                        except Exception:
                            print(f"   ⚠️  Success (execute: {exec_ms:.3f} ms)")
                    else:
                        print(f"   ✅ Success (execute: {exec_ms:.3f} ms)")
                else:
                    print("   ✅ Success")
            else:
                failed += 1
                failed_list.append((file_path, title, err))
                print(f"   ❌ Failed: {err}")
                fail_out.write(f"-- {file_path}\n--- {title}\n{sql}\n-- ERROR: {err}\n\n")

    print("\n============================")
    print(f"Executed {total} queries")
    print(f"✅  Succeeded: {success}")
    print(f"❌  Failed:    {failed}")
    print("============================")

    if failed_list:
        print("\n❌ Failed queries summary:")
        for path, title, err in failed_list:
            print(f"  - {path}  [{title}]: {err}")

    print("\nResults written to:")
    print(f"  • {ALL_FILE}")
    print(f"  • {FAILED_FILE}")
