"""Boundary checks shared by the Python calculator and offline reference."""
import numpy as np


def validate_cube(cube):
    grid=cube['grid']
    expected={'nx':205,'ny':169,'lonMin':119,'lonMax':136,'latMin':30,'latMax':44}
    if any(grid.get(key)!=value for key,value in expected.items()):
        raise ValueError('Unsupported regional KIM grid')
    pressures=np.asarray(cube['pressures'],dtype=float)
    if (pressures.ndim!=1 or not 17<=len(pressures)<=201 or not np.isfinite(pressures).all()
            or np.any(pressures<=0) or np.any(np.diff(pressures)>=0)
            or not 50000<=pressures[0]<=110000):
        raise ValueError('Invalid bottom-to-top pressure levels')
    shape=(len(pressures),grid['ny'],grid['nx'])
    for group,names,size in (('fields',('u','v','w','hgt','T','q'),np.prod(shape)),
                            ('surface',('ps','topo','hpbl'),grid['nx']*grid['ny'])):
        for name in names:
            values=np.asarray(cube[group][name],dtype=float)
            if values.size!=size or not np.isfinite(values).all():
                raise ValueError(f'Incomplete/invalid KIM input: {name}')
    t=np.asarray(cube['fields']['T'],float);q=np.asarray(cube['fields']['q'],float)
    if np.any((t<=150)|(t>=350)) or np.any((q<0)|(q>=.1)):
        raise ValueError('Invalid temperature/specific humidity input')
    return shape
