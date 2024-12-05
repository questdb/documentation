import os
import subprocess
import re
from pathlib import Path
import argparse

PROJECT_ROOT = Path(os.getcwd())
RR_WAR_PATH = PROJECT_ROOT / "rr.war"
INPUT_FILE = PROJECT_ROOT / "static/images/docs/diagrams/.railroad"
OUTPUT_DIR = PROJECT_ROOT / "static/images/docs/diagrams"

print(f"Current working directory: {PROJECT_ROOT}")
print(f"RR.war path: {RR_WAR_PATH}")
print(f"Checking if input file exists: {INPUT_FILE.exists()}")
print(f"Checking if output dir exists: {OUTPUT_DIR.exists()}")
print(f"Checking if rr.war exists: {RR_WAR_PATH.exists()}")

# Custom CSS style to inject
CUSTOM_STYLE = '''
    <style type="text/css">
        @namespace "http://www.w3.org/2000/svg";
        text.nonterminal, text.terminal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, Cantarell, Helvetica, sans-serif;
            font-size: 12px;
        }
        text.terminal {
            fill: #ffffff;
            font-weight: bold;
        }
        text.nonterminal {
            fill: #e289a4;
            font-weight: normal;
        }
        polygon, rect {
            fill: none;
            stroke: none;
        }
        rect.terminal {
            fill: none;
            stroke: #be2f5b;
        }
        rect.nonterminal {
            fill: rgba(255,255,255,0.1);
            stroke: none;
        }
    </style>
'''

def extract_diagrams(file_path):
    """Extract diagram definitions from the input file."""
    diagrams = {}
    current_name = None
    current_definition = []
    
    print(f"Reading from file: {file_path}")
    with open(file_path, 'r') as f:
        for line in f:
            line = line.rstrip()
            
            # Skip empty lines and comments
            if not line or line.startswith('#'):
                continue
            
            # If we find a new definition (non-indented line without ::=)
            if not line.startswith(' ') and '::=' not in line:
                # Save previous diagram if it exists
                if current_name and current_definition:
                    # Format the definition properly
                    formatted_def = []
                    for def_line in current_definition:
                        if '::=' in def_line:
                            # First line needs the name
                            formatted_def.append(f"{current_name} {def_line.strip()}")
                        else:
                            formatted_def.append(def_line.strip())
                    diagrams[current_name] = '\n'.join(formatted_def)
                
                # Start new diagram
                current_name = line.strip()
                current_definition = []
                continue
            
            # Add definition lines to current diagram
            if current_name and line:
                current_definition.append(line)
    
    # Save the last diagram
    if current_name and current_definition:
        formatted_def = []
        for def_line in current_definition:
            if '::=' in def_line:
                # First line needs the name
                formatted_def.append(f"{current_name} {def_line.strip()}")
            else:
                formatted_def.append(def_line.strip())
        diagrams[current_name] = '\n'.join(formatted_def)
    
    return diagrams

def generate_svg(name, definition, temp_dir):
    """Generate SVG for a single diagram definition."""
    temp_grammar = temp_dir / f"{name}.grammar"
    temp_grammar.write_text(definition)
    print(f"Created temporary grammar file: {temp_grammar}")
    
    output_path = OUTPUT_DIR / f"{name}.svg"
    command = [
        "java", "-jar", str(RR_WAR_PATH),
        "-suppressebnf",
        f"-out:{output_path}",
        str(temp_grammar)
    ]
    print(f"Executing command: {' '.join(command)}")
    
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error output: {result.stderr}")
        raise Exception(f"Failed to generate SVG: {result.stderr}")
    
    print(f"Generated SVG at: {output_path}")
    return output_path

def inject_custom_style(svg_path):
    """Extract SVG content, normalize it, and inject custom CSS style."""
    with open(svg_path, 'r') as f:
        content = f.read()
    
    svg_match = re.search(r'<svg[^>]*width="[^"]*"[^>]*height="[^"]*"[^>]*>(.*?)</svg>', content, re.DOTALL)
    if not svg_match:
        print(f"Warning: No diagram SVG found in {svg_path}")
        return
    
    width_match = re.search(r'width="([^"]*)"', svg_match.group(0))
    height_match = re.search(r'height="([^"]*)"', svg_match.group(0))
    
    if not width_match or not height_match:
        print(f"Warning: Missing width or height in {svg_path}")
        return
    
    # Create the new SVG with proper opening tag and our style
    new_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width_match.group(1)}" height="{height_match.group(1)}">
    <defs>
        <style type="text/css">
            @namespace "http://www.w3.org/2000/svg";
            .line                 {{fill: none; stroke: #636273;}}
            .bold-line            {{stroke: #636273; shape-rendering: crispEdges; stroke-width: 2; }}
            .thin-line           {{stroke: #636273; shape-rendering: crispEdges}}
            .filled              {{fill: #636273; stroke: none;}}
            text.terminal        {{font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, Cantarell, Helvetica, sans-serif;
            font-size: 12px;
            fill: #ffffff;
            font-weight: bold;
            }}
            text.nonterminal     {{font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, Cantarell, Helvetica, sans-serif;
            font-size: 12px;
            fill: #e289a4;
            font-weight: normal;
            }}
            text.regexp          {{font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, Cantarell, Helvetica, sans-serif;
            font-size: 12px;
            fill: #00141F;
            font-weight: normal;
            }}
            rect, circle, polygon {{fill: none; stroke: none;}}
            rect.terminal        {{fill: none; stroke: #be2f5b;}}
            rect.nonterminal     {{fill: rgba(255,255,255,0.1); stroke: none;}}
            rect.text            {{fill: none; stroke: none;}}
            polygon.regexp       {{fill: #C7ECFF; stroke: #038cbc;}}
        </style>
    </defs>'''
    
    inner_content = svg_match.group(1)
    
    inner_content = re.sub(r'\s+xmlns="[^"]*"', '', inner_content)
    inner_content = re.sub(r'\s+style="[^"]*"', '', inner_content)
    inner_content = inner_content.strip()
    
    final_svg = f"{new_svg}\n    {inner_content}\n</svg>"
    
    with open(svg_path, 'w') as f:
        f.write(final_svg)

def main():
    # Add argument parsing
    parser = argparse.ArgumentParser(description='Generate railroad diagrams')
    parser.add_argument('diagram_name', nargs='?', help='Optional specific diagram name to generate')
    args = parser.parse_args()

    temp_dir = PROJECT_ROOT / "temp_grammar"
    temp_dir.mkdir(exist_ok=True)
    print(f"Created temp directory: {temp_dir}")
    
    markdown_syntax_list = [] 
    processed_diagrams = set()  
    orphaned_diagrams = []     

    try:
        diagrams = extract_diagrams(INPUT_FILE)

        if args.diagram_name:
            if args.diagram_name not in diagrams:
                print(f"Error: Diagram '{args.diagram_name}' not found in .railroad file")
                return
            # Process only the specified diagram
            diagrams = {args.diagram_name: diagrams[args.diagram_name]}

        for name, definition in diagrams.items():
            print(f"\nProcessing diagram: {name}")
            processed_diagrams.add(name)
            
            output_path = OUTPUT_DIR / f"{name}.svg"
            try:
                svg_path = generate_svg(name, definition, temp_dir)
                inject_custom_style(svg_path)
                print(f"Successfully generated: {name}.svg")
                markdown_syntax_list.append(f"![Diagram for {name}](/images/docs/diagrams/{name}.svg)")
            except Exception as e:
                print(f"Error processing {name}: {str(e)}")
        
        # Only check for orphaned diagrams if we're processing all diagrams
        if not args.diagram_name:
            for svg_file in OUTPUT_DIR.glob("*.svg"):
                diagram_name = svg_file.stem
                if diagram_name not in processed_diagrams:
                    orphaned_diagrams.append(diagram_name)
    
    finally:
        print("\nCleaning up...")
        for file in temp_dir.glob("*.grammar"):
            print(f"Removing temporary file: {file}")
            file.unlink()
        temp_dir.rmdir()
        print("Cleanup complete")
        
        if markdown_syntax_list:
            print("\nCopy the image syntax below and paste it into your markdown file:")
            for syntax in markdown_syntax_list:
                print(syntax)
        
        if orphaned_diagrams:
            print("\nFound orphaned diagrams (these exist as SVGs but have no matching syntax):")
            for diagram in sorted(orphaned_diagrams):
                print(f"- {diagram}")

if __name__ == "__main__":
    main()