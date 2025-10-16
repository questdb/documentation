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
# Queries taking more than 1 second appear in yellow, and those taking over 2.5 seconds appear in orange.
# Failing queries appear with a red ❌ icon and are summarized at the end.
#
# Each query is executed once. If it takes longer than 1 second, it runs again to measure
# the “hot” (cached) performance. Colouring is based on the hot run.
#
# Three files are generated:
#   • all_queries.sql          → all executed queries
#   • failed_queries.sql       → only the queries that failed
#   • query_validation_report.txt → final execution summary (failures and slow queries)

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
REPORT_FILE = Path("query_validation_report.txt")
TIMEOUT = (3, 60)

# ANSI color escape codes
YELLOW = "\033[93m"
ORANGE = "\033[38;5;208m"
RESET = "\033[0m"

block_re = re.compile(
    r"```questdb-sql[^\n]*title=\"([^\"]+)\"[^\n]*\bdemo\b[^\n]*\n(.*?)```",
    re.DOTALL,
)

def extract_blocks(root_dir):
    root = Path(root_dir)
    for ext in ("*.md", "*.mdx"):
        for path in root.rglob(ext):
            # Skip full reference to avoid double processing
            if path.as_posix().endswith("static/reference-full.md"):
                continue
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
            return True, None, None

    except requests.Timeout:
        return False, f"Timeout after {TIMEOUT[1]}s", None
    except Exception as e:
        return False, str(e), None

def print_timing(exec_ms_cold, exec_ms_hot=None):
    """Print timing with colour based on hot time if provided."""
    if exec_ms_hot is not None:
        hot = exec_ms_hot
        if hot >= 2500:
            print(f"   {ORANGE}🔥  Success (cold run: {exec_ms_cold:.3f} ms, hot run: {exec_ms_hot:.3f} ms){RESET}")
        elif hot >= 1000:
            print(f"   {YELLOW}⚠️  Success (cold run: {exec_ms_cold:.3f} ms, hot run: {exec_ms_hot:.3f} ms){RESET}")
        else:
            print(f"   ✅ Success (cold run: {exec_ms_cold:.3f} ms, hot run: {exec_ms_hot:.3f} ms)")
    else:
        if exec_ms_cold >= 2500:
            print(f"   {ORANGE}🔥  Success (execute: {exec_ms_cold:.3f} ms){RESET}")
        elif exec_ms_cold >= 1000:
            print(f"   {YELLOW}⚠️  Success (execute: {exec_ms_cold:.3f} ms){RESET}")
        else:
            print(f"   ✅ Success (execute: {exec_ms_cold:.3f} ms)")

if __name__ == "__main__":
    success = 0
    failed = 0
    failed_list = []
    slow_list = []       # 1–2.5s
    very_slow_list = []  # ≥2.5s
    blocks = list(extract_blocks(ROOT_DIR))
    total = len(blocks)

    print(f"QuestDB REST URL: {QUESTDB_REST_URL}")
    print(f"Searching in: {Path(ROOT_DIR).resolve()}")
    print(f"Found {total} queries to execute.\n")

    with ALL_FILE.open("w", encoding="utf-8") as all_out, \
         FAILED_FILE.open("w", encoding="utf-8") as fail_out:
        for i, (file_path, title, sql) in enumerate(blocks, 1):
            print(f"[{i}/{total}] Executing: {file_path}  [{title}]")
            sys.stdout.flush()

            ok, err, exec_time_cold = execute_query(sql)
            all_out.write(f"-- {file_path}\n--- {title}\n{sql}\n\n")

            if not ok:
                failed += 1
                failed_list.append((file_path, title, err))
                print(f"   ❌ Failed: {err}")
                fail_out.write(f"-- {file_path}\n--- {title}\n{sql}\n-- ERROR: {err}\n\n")
                continue

            success += 1
            if exec_time_cold is not None:
                exec_ms_cold = exec_time_cold / 1_000_000
                exec_ms_hot = None

                if exec_ms_cold >= 1000:
                    ok_hot, err_hot, exec_time_hot = execute_query(sql)
                    if ok_hot and exec_time_hot is not None:
                        exec_ms_hot = exec_time_hot / 1_000_000
                        print_timing(exec_ms_cold, exec_ms_hot)

                        # classify based on hot time
                        if exec_ms_hot >= 2500:
                            very_slow_list.append((file_path, title, exec_ms_cold, exec_ms_hot))
                        elif exec_ms_hot >= 1000:
                            slow_list.append((file_path, title, exec_ms_cold, exec_ms_hot))
                    else:
                        print_timing(exec_ms_cold)
                        if exec_ms_cold >= 2500:
                            very_slow_list.append((file_path, title, exec_ms_cold, None))
                        elif exec_ms_cold >= 1000:
                            slow_list.append((file_path, title, exec_ms_cold, None))
                else:
                    print_timing(exec_ms_cold)
            else:
                print("   ✅ Success")

    # ---------- Summary report ----------
    report_lines = []
    report_lines.append("============================")
    report_lines.append(f"Executed {total} queries")
    report_lines.append(f"✅  Succeeded: {success}")
    report_lines.append(f"❌  Failed:    {failed}")
    report_lines.append("============================\n")

    if failed_list:
        report_lines.append("❌ Failed queries:")
        for path, title, err in failed_list:
            report_lines.append(f"  - {path}  [{title}]: {err}")
        report_lines.append("")

    if very_slow_list:
        report_lines.append("🔥 Very slow queries (≥ 2.5 s hot run):")
        for path, title, cold, hot in very_slow_list:
            if hot is not None:
                report_lines.append(f"  - {path}  [{title}] cold={cold:.3f} ms, hot={hot:.3f} ms")
            else:
                report_lines.append(f"  - {path}  [{title}] cold={cold:.3f} ms")
        report_lines.append("")

    if slow_list:
        report_lines.append("⚠️  Slow queries (1–2.5 s hot run):")
        for path, title, cold, hot in slow_list:
            if hot is not None:
                report_lines.append(f"  - {path}  [{title}] cold={cold:.3f} ms, hot={hot:.3f} ms")
            else:
                report_lines.append(f"  - {path}  [{title}] cold={cold:.3f} ms")
        report_lines.append("")

    report_lines.append("Results written to:")
    report_lines.append(f"  • {ALL_FILE}")
    report_lines.append(f"  • {FAILED_FILE}")
    report_lines.append(f"  • {REPORT_FILE}")

    final_report = "\n".join(report_lines)
    print("\n" + final_report)

    REPORT_FILE.write_text(final_report, encoding="utf-8")
