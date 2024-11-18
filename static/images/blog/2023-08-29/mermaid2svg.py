#!/usr/bin/env python3

"""
Uses https://github.com/mermaid-js/mermaid-cli to convert mermaid files to svg.
"""

import sys
sys.dont_write_bytecode = True

import glob
import subprocess


def main():
    mermaid_files = glob.glob('*.mmd')
    for mermaid_file in mermaid_files:
        file_no_ext = mermaid_file[:-4]
        print(f'Converting {mermaid_file} to {file_no_ext}.svg')
        subprocess.run([
            'mmdc',
            '-i', mermaid_file,
            '-o', f'{file_no_ext}.svg',
            '-t', 'dark',
            '-b', 'transparent', '-w', '1024'])


if __name__ == '__main__':
    main()
