import re
import requests
from pathlib import Path
import sys
import json
import argparse

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


QUESTDB_REST_URL = f"{args.url.rstrip('/')}/exec"
ROOT_DIR = args.path
ALL_FILE = Path("all_queries.sql")
FAILED_FILE = Path("failed_queries.sql")
TIMEOUT = (3, 5)
MAX_BYTES = 8192

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
    """Execute the query via GET, keeping it exactly as-is and parsing 400 bodies."""
    try:
        with requests.get(
            QUESTDB_REST_URL, params={"query": query}, timeout=TIMEOUT, stream=True
        ) as r:
            content = b""
            for chunk in r.iter_content(chunk_size=1024):
                content += chunk
                if len(content) > MAX_BYTES:
                    break

            text = content.decode("utf-8", errors="ignore").strip()
            if r.status_code != 200:
                try:
                    js = json.loads(text)
                    if "error" in js:
                        return False, js["error"]
                except Exception:
                    pass
                return False, f"HTTP {r.status_code} {r.reason}: {text or 'No body'}"

            if not text:
                return True, None

            try:
                js = json.loads(text)
                if "error" in js:
                    return False, js["error"]
                return True, None
            except json.JSONDecodeError:
                return True, None

    except requests.Timeout:
        return False, f"Timeout after {TIMEOUT[1]}s"
    except Exception as e:
        return False, str(e)

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

            ok, err = execute_query(sql)
            all_out.write(f"-- {file_path}\n--- {title}\n{sql}\n\n")

            if ok:
                success += 1
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
