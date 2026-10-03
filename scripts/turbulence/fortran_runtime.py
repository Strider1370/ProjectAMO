"""Binary I/O and validation for unchanged original TURB routines."""
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess

import numpy as np


REPO = Path(__file__).resolve().parents[2]
DEFAULT_BUILD = REPO/'artifacts/kim-turbulence-fortran/build'


def load_build(folder):
    manifest = json.loads((folder/'build.json').read_text())
    for item in manifest['files']:
        if hashlib.sha256((REPO/item['file']).read_bytes()).hexdigest() != item['sha256']:
            raise ValueError(f"Fortran source changed after build: {item['file']}")
    if hashlib.sha256(Path(manifest['executable']).read_bytes()).hexdigest() != manifest['executableSha256']:
        raise ValueError('Fortran executable differs from build manifest')
    return manifest


def ensure_build(folder):
    try:
        return load_build(folder)
    except (OSError, ValueError, KeyError):
        subprocess.run([os.sys.executable, str(REPO/'scripts/turbulence/build_fortran_reference.py'),
                        '--output', str(folder)], check=True)
        return load_build(folder)


from input_validation import validate_cube


def run_original(build, cube, folder, calibration, mode='active-main'):
    shape = validate_cube(cube)
    folder.mkdir(parents=True,exist_ok=True)
    # The original adapter uses character*200 paths. Never let Fortran truncate.
    if any(len(str(path).encode('utf-8')) >= 200 for path in (folder/'input.bin',str(folder)+'/',REPO/calibration['source'])):
        raise ValueError('Path exceeds original Fortran character*200 limit')
    input_file = folder/'input.bin'
    write_input(cube,input_file)
    compiler = Path(build['compiler'])
    local_lib = compiler.parents[1]/'lib/x86_64-linux-gnu'
    env = os.environ.copy()
    env['LD_LIBRARY_PATH'] = str(local_lib)+(':'+env['LD_LIBRARY_PATH'] if env.get('LD_LIBRARY_PATH') else '')
    with (folder/'stdout.log').open('w') as log:
        subprocess.run([build['executable'],str(input_file),str(folder)+'/',
                        str(REPO/calibration['source']),mode],env=env,stdout=log,stderr=log,check=True)
    mask = np.zeros(shape[1:],bool)
    mask[10:-10,10:-10] = True
    checks = {'configuration':verify_configuration(folder,calibration),
              'input':verify_input_records(folder,cube,shape,mask),
              'mode':mode, 'inputSha256':hashlib.sha256(input_file.read_bytes()).hexdigest()}
    (folder/'adapter-checks.json').write_text(json.dumps(checks,indent=2))
    return checks


def read_f_record(file, shape):
    payload = file.read_bytes()
    size = int(np.prod(shape))*4
    if len(payload) != size+8 or struct.unpack('<i', payload[:4])[0] != size or struct.unpack('<i', payload[-4:])[0] != size:
        raise ValueError(f'Invalid original Fortran record: {file}')
    values = np.frombuffer(payload, '<f4', count=size//4, offset=4).reshape(shape).astype(float)
    return np.where(np.abs(values+9999) <= 1e-3, np.nan, values)



def write_input(cube, file):
    grid = cube['grid']
    with file.open('wb') as stream:
        stream.write(struct.pack('<3i4f', grid['nx'], grid['ny'], len(cube['pressures']),
                                 grid['lonMin'],grid['lonMax'],grid['latMin'],grid['latMax']))
        for name in ('u','v','w','hgt','T','q'):
            stream.write(np.asarray(cube['fields'][name],dtype='<f4').tobytes())
        stream.write(np.asarray(cube['pressures'],dtype='<f4').tobytes())
        for name in ('ps','topo','hpbl'):
            stream.write(np.asarray(cube['surface'][name],dtype='<f4').tobytes())



def verify_input_records(folder, cube, shape, mask):
    """Check the adapter's array layout against primitives saved by Fortran."""
    checked = []
    for name, code in (('u',4), ('v',5), ('hgt',7), ('T',11), ('pressure',1)):
        original = read_f_record(folder/f'{code}.F',shape)
        expected = (np.broadcast_to(np.asarray(cube['pressures'],np.float32)[:,None,None],shape)
                    if name == 'pressure' else np.asarray(cube['fields'][name],np.float32).reshape(shape))
        interior = np.broadcast_to(mask,shape)
        if not np.array_equal(original[interior],expected[interior]):
            raise ValueError(f'Fortran input layout/value mismatch: {name}')
        checked.append(name)
    return {'binary32ExactOnInterior': checked}



def verify_configuration(folder, calibration):
    data = (folder/'configuration.bin').read_bytes()
    if len(data) != (96+3*96*4)*4:
        raise ValueError('Invalid Fortran configuration record')
    pick = np.frombuffer(data,'<i4',count=3*96,offset=96*4).reshape((3,96),order='F')
    weights = np.frombuffer(data,'<f4',count=3*96,offset=(96+3*96)*4).reshape((3,96),order='F')
    fits = np.frombuffer(data,'<f4',count=3*96*2,offset=(96+3*96*2)*4).reshape((3,96,2),order='F')
    pairs = 0
    for region in range(1,4):
        selected = calibration['selected'][str(region)]
        if selected != (np.flatnonzero(pick[region-1]>0)+400).tolist():
            raise ValueError('Original selection does not match calibration')
        for code in selected:
            fit = calibration['fits'][f'{region}:{code}']
            if not np.array_equal(fits[region-1,code-400],np.array([fit['a'],fit['b']],np.float32)):
                raise ValueError(f'Original PDF fit differs: {region}:{code}')
            count = sum((c>=476) == (code>=476) for c in selected)
            if weights[region-1,code-400] != np.float32(1/count):
                raise ValueError(f'Original equal weight differs: {region}:{code}')
            pairs += 1
    return {'selectedCounts': [7,8,13], 'distinctDiagnostics': 24, 'fitPairsVerified': pairs,
            'weightsVerified': pairs}
