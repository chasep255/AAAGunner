#!/usr/bin/env python3
"""Give each published module graph a stable, content-addressed asset path."""
import hashlib
from pathlib import Path
import shutil
import sys

output = Path(sys.argv[1])
digest = hashlib.sha256()
for path in sorted(output.rglob('*')):
    if path.is_file():
        digest.update(path.relative_to(output).as_posix().encode() + b'\0')
        digest.update(path.read_bytes())

version = digest.hexdigest()[:16]
release = output / 'releases' / version
release.mkdir(parents=True)
index = output / 'index.html'
html = index.read_text()
for folder in ('src', 'engine', 'vendor', 'styles'):
    # Preserve the original paths for visitors with previously cached HTML.
    shutil.copytree(output / folder, release / folder)
    html = html.replace(f'./{folder}/', f'./releases/{version}/{folder}/')
index.write_text(html)
print(f'Packaged game assets: {version}')
