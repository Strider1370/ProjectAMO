"""Compile unchanged operational TURB routines with the comparison adapter."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess


def extract_subroutine(source, name):
    # Keep the original bytes, including mixed legacy comment encodings.
    text = source.read_bytes().decode('latin1')
    headers = list(re.finditer(r'^ {6}(?:subroutine|(?:\w+(?:\*\d+)?\s+)?function)\s+(\w+)\b', text, re.M | re.I))
    for i, match in enumerate(headers):
        if match[1].lower() == name.lower():
            end = headers[i+1].start() if i+1 < len(headers) else len(text)
            return text[match.start():end], {'file': str(source), 'routine': name,
                                           'line': text[:match.start()].count('\n')+1}
    raise ValueError(f'Missing original routine: {name}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    src = repo/'reference/TURB/_SRC'
    default_compiler = shutil.which('gfortran') or repo/'.artifacts/turbulence-fortran-toolchain/usr/bin/x86_64-linux-gnu-gfortran-13'
    compiler = Path(args.compiler or default_compiler).resolve()
    if not compiler.is_file():
        raise FileNotFoundError('GNU Fortran compiler required; specify --compiler or KIM_TURBULENCE_FORTRAN_BUILD with an existing build')
    out = (args.output or repo/'artifacts/kim-turbulence-fortran/build').resolve()
    out.mkdir(parents=True, exist_ok=True)
    helpers, origins = [], []
    for file, routine in [('g_ktg_score_8km_KIM_global_mpi_remap_main.f', 'CheckIndices'),
                          ('scoreroutines31x20.f', 'AVEVAR')]:
        code, origin = extract_subroutine(src/file, routine)
        helpers.append(code)
        origins.append(origin)
    helper = out/'original_helpers.f'
    helper.write_bytes('\n'.join(helpers).encode('latin1'))
    files = [src/name for name in ('indices_gtg40ARismwtNoRi.f', 'interproutines38.f', 'itfacomp41.f',
                                  'remaproutines31x5.f', 'read_config34.f', 'sortroutines.f',
                                  'calndr.f', 'find_free_unit.f')]
    files += [helper, Path(__file__).with_name('fortran_reference.f')]
    used = set()

    def record(file):
        if file in used:
            return
        used.add(file)
        for line in file.read_bytes().decode('latin1').splitlines():
            if line[:1].lower() in ('c', '*', '!'):
                continue
            match = re.match(r"\s*include\s+['\"]([^'\"]+)['\"]", line, re.I)
            if match:
                record(src/match[1])

    for file in files:
        record(file)
    used.add(Path(__file__).resolve())
    env = os.environ.copy()
    local_lib = compiler.parents[1]/'lib/x86_64-linux-gnu'
    env['LD_LIBRARY_PATH'] = str(local_lib) + (':'+env['LD_LIBRARY_PATH'] if env.get('LD_LIBRARY_PATH') else '')
    flags = ['-O2', '-std=legacy', '-ffixed-line-length-132', '-fallow-argument-mismatch',
             '-fno-range-check', '-ffunction-sections', '-fdata-sections', '-I', str(src)]
    objects = []
    with (out/'build.log').open('w') as log:
        for file in files:
            obj = out/(file.stem+'.o')
            print(f'Compiling original {file.name}', flush=True)
            subprocess.run([str(compiler), *flags, '-c', str(file), '-o', str(obj)], env=env,
                           stdout=log, stderr=log, check=True)
            objects.append(str(obj))
        executable = out/'turbulence_reference'
        subprocess.run([str(compiler), *objects, '-Wl,--gc-sections', '-B'+str(local_lib),
                        '-L'+str(local_lib), '-o', str(executable)], env=env, stdout=log, stderr=log, check=True)
    version = subprocess.check_output([str(compiler), '--version'], env=env, text=True).splitlines()[0]
    manifest = {'compiler': str(compiler), 'compilerVersion': version, 'flags': flags,
                'executable': str(executable), 'executableSha256': hashlib.sha256(executable.read_bytes()).hexdigest(),
                'extractedUnchangedHelpers': origins,
                'files': [{'file': str(p.relative_to(repo)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                          for p in sorted(used)],
                'scope': 'Unchanged indices_gtg and static native .F combination routines on the same regional 21-layer inputs; not the full Intel MPI/NetCDF operational executable'}
    (out/'build.json').write_text(json.dumps(manifest, indent=2))
    print(executable, flush=True)


if __name__ == '__main__':
    main()
