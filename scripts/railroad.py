import os
import subprocess
import re
from pathlib import Path

# Get absolute paths relative to project root
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
        previous_line = ""
        for line in f:
            line = line.rstrip()  # Keep right whitespace
            
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                previous_line = ""
                continue
            
            # Check for new diagram definition
            if '::=' in line:
                # If we have a previous non-empty line, it's the name
                if previous_line and not previous_line.startswith('-'):
                    # Store previous diagram if exists
                    if current_name and current_definition:
                        diagrams[current_name] = '\n'.join(current_definition)
                    
                    # Start new diagram
                    current_name = previous_line.strip()
                    current_definition = [f"{current_name} {line.strip()}"]
                    print(f"Found diagram: {current_name}")
                
            elif current_name and line:  # Continue previous diagram
                current_definition.append(line)
            
            previous_line = line
                
    # Store the last diagram
    if current_name and current_definition:
        diagrams[current_name] = '\n'.join(current_definition)
    
    print(f"\nFound {len(diagrams)} diagrams: {sorted(diagrams.keys())}")
    
    # Debug: Print first diagram content
    if diagrams:
        first_key = sorted(diagrams.keys())[0]
        print(f"\nFirst diagram '{first_key}' content:")
        print(diagrams[first_key])
    
    return diagrams

def generate_svg(name, definition, temp_dir):
    """Generate SVG for a single diagram definition."""
    # Create temporary grammar file
    temp_grammar = temp_dir / f"{name}.grammar"
    temp_grammar.write_text(definition)
    print(f"Created temporary grammar file: {temp_grammar}")
    
    # Generate SVG using rr.war
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
    
    # Find the actual diagram SVG (not the style SVG)
    # Look for SVG with width and height attributes
    svg_match = re.search(r'<svg[^>]*width="[^"]*"[^>]*height="[^"]*"[^>]*>(.*?)</svg>', content, re.DOTALL)
    if not svg_match:
        print(f"Warning: No diagram SVG found in {svg_path}")
        return
    
    # Extract width and height
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
    
    # Get the inner content (everything after the opening SVG tag)
    inner_content = svg_match.group(1)
    
    # Clean up the content
    inner_content = re.sub(r'\s+xmlns="[^"]*"', '', inner_content)
    inner_content = re.sub(r'\s+style="[^"]*"', '', inner_content)
    inner_content = inner_content.strip()
    
    # Combine everything
    final_svg = f"{new_svg}\n    {inner_content}\n</svg>"
    
    with open(svg_path, 'w') as f:
        f.write(final_svg)

def main():
    # Create temp directory for grammar files
    temp_dir = PROJECT_ROOT / "temp_grammar"
    temp_dir.mkdir(exist_ok=True)
    print(f"Created temp directory: {temp_dir}")
    
    try:
        # Extract diagrams from input file
        diagrams = extract_diagrams(INPUT_FILE)
        
        # Process each diagram
        for name, definition in diagrams.items():
            print(f"\nProcessing diagram: {name}")
            
            # Skip if SVG already exists
            output_path = OUTPUT_DIR / f"{name}.svg"
            if output_path.exists():
                print(f"Skipping existing diagram: {name}")
                continue
                
            try:
                # Generate SVG
                svg_path = generate_svg(name, definition, temp_dir)
                
                # Inject custom style
                inject_custom_style(svg_path)
                
                print(f"Successfully generated: {name}.svg")
            except Exception as e:
                print(f"Error processing {name}: {str(e)}")
    
    finally:
        # Cleanup temp directory
        print("\nCleaning up...")
        for file in temp_dir.glob("*.grammar"):
            print(f"Removing temporary file: {file}")
            file.unlink()
        temp_dir.rmdir()
        print("Cleanup complete")

if __name__ == "__main__":
    main()