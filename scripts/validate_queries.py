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
# The script executes all QuestDB demo SQL queries found in Markdown files,
# in the live demo JSON configuration at:
#     https://demo.questdb.io/assets/console-configuration.json
# and (optionally) from public dashboards:
#     https://questdb.com/dashboards/fx-orderbook/
#     https://questdb.com/dashboards/crypto/
#
# It reports execution times for each query.
# Queries taking more than 1 second appear in yellow.
# Queries taking more than 2.5 seconds appear in orange.
# Failing queries appear with a red ❌ icon and are summarized at the end.
#
# Each slow query (≥ 1s) is executed twice: first cold, then hot.
# Colours are decided based on the hot run.
#
# You can disable any source with:
#   --process-local no        (skip local markdown queries)
#   --process-demo  no        (skip queries from the demo JSON)
#   --process-dashboards no   (skip queries from dashboards)
#
# Three files are generated:
#   • all_queries.sql            → all executed queries
#   • failed_queries.sql         → only the queries that failed
#   • query_validation_report.txt → final summary (failures and slow queries)

import re
import requests
from pathlib import Path
import sys
import json
import argparse
import html
from urllib.parse import urlparse, parse_qs, unquote

# ---------------- Argument parsing ----------------
parser = argparse.ArgumentParser(
    description="Execute all QuestDB demo SQL queries found in Markdown files, demo JSON, and dashboards."
)
parser.add_argument("--path", default=".", help="Root folder to search for .md and .mdx files (default: current directory)")
parser.add_argument("--url", default="http://localhost:9000", help="QuestDB REST API base URL, e.g. http://localhost:9000 (default: localhost)")
parser.add_argument("--process-local", default="yes", choices=["yes", "no"], help="Whether to process local markdown files (default: yes)")
parser.add_argument("--process-demo", default="yes", choices=["yes", "no"], help="Whether to process demo queries from the live console JSON (default: yes)")
parser.add_argument("--process-dashboards", default="yes", choices=["yes", "no"], help="Whether to process dashboard queries (default: yes)")
args = parser.parse_args()

# ---------------- Configuration ----------------
QUESTDB_REST_URL = f"{args.url.rstrip('/')}/exec"
ROOT_DIR = args.path
ALL_FILE = Path("all_queries.sql")
FAILED_FILE = Path("failed_queries.sql")
REPORT_FILE = Path("query_validation_report.txt")
TIMEOUT = (3, 60)
DEMO_URL = "https://demo.questdb.io/assets/console-configuration.json"
DASHBOARD_URLS = [
    "https://questdb.com/dashboards/fx-orderbook/",
    "https://questdb.com/dashboards/crypto/",
]

# ANSI color escape codes
YELLOW = "\033[93m"
ORANGE = "\033[38;5;208m"
RESET = "\033[0m"

block_re = re.compile(r"```questdb-sql[^\n]*title=\"([^\"]+)\"[^\n]*\bdemo\b[^\n]*\n(.*?)```", re.DOTALL)
href_re = re.compile(r'href="https://demo\.questdb\.io\?query=([^"]+)"')

# ---------------- Data extraction ----------------
def extract_local_blocks(root_dir):
    root = Path(root_dir)
    for ext in ("*.md", "*.mdx"):
        for path in root.rglob(ext):
            if path.as_posix().endswith("static/reference-full.md"):
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for match in block_re.finditer(text):
                title, sql = match.groups()
                yield path, title.strip(), sql.strip()

def extract_demo_queries():
    """Fetch queries from QuestDB demo JSON and remove leading /* ... */ comment blocks."""
    try:
        r = requests.get(DEMO_URL, timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"⚠️  Failed to fetch demo JSON: {e}")
        return []

    results = []
    block_comment_re = re.compile(r"^\s*/\*.*?\*/", re.DOTALL)

    for section in data.get("savedQueries", []):
        section_title = section.get("title", "Untitled Section")
        for q in section.get("queries", []):
            name = q.get("name", "Unnamed Query")
            raw_sql = q.get("value", "")
            if not raw_sql:
                continue

            # Decode escaped sequences like \u003e, etc.
            sql = (
                raw_sql.replace("\\u003e", ">")
                       .replace("\\u003c", "<")
                       .replace("\\u003d", "=")
                       .replace("\\u0026", "&")
                       .replace("\\u0027", "'")
            )
            sql = html.unescape(sql).strip()
            sql = block_comment_re.sub("", sql, count=1).lstrip()

            if sql:
                title = f"{section_title} – {name}"
                results.append((DEMO_URL, title, sql))
    return results

def extract_dashboard_queries():
    dashboards = [
        "https://questdb.com/dashboards/fx-orderbook/",
        "https://questdb.com/dashboards/crypto/",
    ]
    a_href_re = re.compile(r'href="([^"]+)"')

    for url in dashboards:
        try:
            resp = requests.get(url, timeout=TIMEOUT)
            resp.raise_for_status()
            html_body = resp.text
        except Exception as e:
            print(f"⚠️  Could not fetch {url}: {e}")
            continue

        # Grab ALL hrefs and filter to demo.questdb.io links
        for href in a_href_re.findall(html_body):
            if "demo.questdb.io?query=" not in href:
                continue

            # 1) HTML-unescape the whole href so &amp; -> &
            href_unescaped = html.unescape(href)

            # 2) Parse the URL to get the real 'query' param safely
            parsed = urlparse(href_unescaped)
            qs = parse_qs(parsed.query)
            if "query" not in qs or not qs["query"]:
                continue
            raw_query = qs["query"][0]  # first value

            # 3) Decode the SQL: unescape HTML entities, then unquote twice
            sql = html.unescape(raw_query)
            sql = unquote(sql)
            sql = unquote(sql)
            sql = sql.strip()

            if not sql:
                continue

            # Optional: better panel labeling by order
            # If you want "Dashboard <slug> – Panel N"
            # we can count per page:
            # (Use enumerate over matches instead if needed)
            # Here we derive a simple title:
            page_slug = url.rstrip("/").split("/")[-1]
            title = f"Dashboard {page_slug} – Panel"

            # If you need panel indices: collect first then enumerate;
            # for simplicity, just yield and let the caller enumerate.
            yield url, title, sql


# ---------------- Query execution ----------------
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

# ---------------- Printing ----------------
def print_timing(exec_ms_cold, exec_ms_hot=None):
    if exec_ms_hot is not None:
        hot = exec_ms_hot
        if hot >= 2500:
            print(f"   {ORANGE}🔥  Success (cold: {exec_ms_cold:.3f} ms, hot: {exec_ms_hot:.3f} ms){RESET}")
        elif hot >= 1000:
            print(f"   {YELLOW}⚠️  Success (cold: {exec_ms_cold:.3f} ms, hot: {exec_ms_hot:.3f} ms){RESET}")
        else:
            print(f"   ✅ Success (cold: {exec_ms_cold:.3f} ms, hot: {exec_ms_hot:.3f} ms)")
    else:
        if exec_ms_cold >= 2500:
            print(f"   {ORANGE}🔥  Success (execute: {exec_ms_cold:.3f} ms){RESET}")
        elif exec_ms_cold >= 1000:
            print(f"   {YELLOW}⚠️  Success (execute: {exec_ms_cold:.3f} ms){RESET}")
        else:
            print(f"   ✅ Success (execute: {exec_ms_cold:.3f} ms)")

# ---------------- Main ----------------
if __name__ == "__main__":
    success = 0
    failed = 0
    failed_list = []
    slow_list = []
    very_slow_list = []

    # Collect queries
    blocks = []
    if args.process_local == "yes":
        blocks.extend(extract_local_blocks(ROOT_DIR))
    if args.process_demo == "yes":
        blocks.extend(extract_demo_queries())
    if args.process_dashboards == "yes":
        blocks.extend(extract_dashboard_queries())

    total = len(blocks)
    print(f"QuestDB REST URL: {QUESTDB_REST_URL}")
    print(f"Searching in: {Path(ROOT_DIR).resolve()}")
    print(f"Found {total} queries to execute.\n")

    with ALL_FILE.open("w", encoding="utf-8") as all_out, FAILED_FILE.open("w", encoding="utf-8") as fail_out:
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
