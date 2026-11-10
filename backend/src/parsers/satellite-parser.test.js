import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseCiNC, parseCtpsNC } from './satellite-parser.js'

const HDF5 = Uint8Array.from([0x89, 0x48, 0x44, 0x46, 0, 0, 0, 0]).buffer
const projection = { image_width: 2, image_height: 2, pixel_size: 2000, upper_left_easting: -899000, upper_left_northing: 899000 }

function runtimeFor(datasets) {
  const files = new Set()
  const unlinked = []
  return {
    files, unlinked,
    FS: { writeFile: (name) => files.add(name), unlink: (name) => { unlinked.push(name); files.delete(name) } },
    File: function File() { return { attrs: projection, keys: () => Object.keys(datasets), get: (name) => { if (!datasets[name]) throw new Error('missing'); return datasets[name] }, close() {} } },
  }
}

describe('GK2A product parsers', () => {
  it('keeps only CI datasets and projection metadata available to callers', async () => {
    const runtime = runtimeFor({
      CI1_prob: { value: new Uint8Array([0, 3, 4, 9]), attrs: { _FillValue: 255 } },
      DQF_CI1: { value: new Uint8Array([0, 1, 0, 2]), attrs: { _FillValue: 255 } },
    })
    const parsed = await parseCiNC(HDF5, runtime)
    assert.deepEqual([...parsed.signal], [0, 3, 4, 9])
    assert.equal(parsed.attrs.signalFill, 255)
    assert.equal(runtime.files.size, 0)
    assert.equal(runtime.unlinked.length, 1)
  })

  it('reads CTPS scale, offset, fill and quality datasets', async () => {
    const runtime = runtimeFor({
      CTH: { value: new Uint16Array([100, 0, 65535, 200]), attrs: { scale_factor: 0.01, add_offset: 0, _FillValue: 65535 } },
      CTT: { value: new Uint16Array([2800, 0, 65535, 2900]), attrs: { scale_factor: 0.1, add_offset: 0, _FillValue: 65535 } },
      CTPS_flag: { value: new Uint8Array([0, 1, 255, 0]), attrs: { _FillValue: 255 } },
    })
    const parsed = await parseCtpsNC(HDF5, runtime)
    assert.equal(parsed.attrs.cthScale, 0.01)
    assert.equal(parsed.attrs.cttOffset, 0)
    assert.equal(parsed.attrs.flagFill, 255)
  })

  it('rejects invalid HDF5 input and missing required datasets', async () => {
    await assert.rejects(parseCiNC(new ArrayBuffer(8), runtimeFor({})), /HDF5 magic/)
    await assert.rejects(parseCiNC(HDF5, runtimeFor({ CI1_prob: { value: new Uint8Array(4), attrs: { _FillValue: 255 } } })), /DQF_CI1/)
  })

  it('validates GEOS navigation and resamples CTPS to the existing KO grid', async () => {
    const datasets = {
      CTH: { shape: [1200, 1900], value: new Uint16Array(1200 * 1900).fill(1200), attrs: { scale_factor: 0.01, add_offset: 0, _FillValue: 65535 } },
      CTT: { value: new Uint16Array(1200 * 1900).fill(25000), attrs: { scale_factor: 0.01, add_offset: 0, _FillValue: 65535 } },
      CTPS_flag: { value: new Uint8Array(1200 * 1900), attrs: { _FillValue: 255 } },
      gk2a_imager_projection: { attrs: { grid_mapping_name: 'geostationary', longitude_of_projection_origin: 128.2, perspective_point_height: 35785864, semi_major_axis: 6378137, semi_minor_axis: 6356752.5, column_scale_factor: 20425338, line_scale_factor: 20425338, column_offset: 1125.5, line_offset: 2337.5 } },
    }
    const parsed = await parseCtpsNC(HDF5, runtimeFor(datasets))
    assert.equal(parsed.cth.length, 810000)
    assert.equal(parsed.attrs.width, 900)
    assert.equal(parsed.attrs.ulEasting, -899000)
    assert.equal(parsed.cth[405450], 1200)
    delete datasets.gk2a_imager_projection.attrs.column_offset
    await assert.rejects(parseCtpsNC(HDF5, runtimeFor(datasets)), /column_offset/)
  })

  it('uses unique temporary names for concurrent reads and cleans them all', async () => {
    const runtime = runtimeFor({
      CI1_prob: { value: new Uint8Array(4), attrs: { _FillValue: 255 } },
      DQF_CI1: { value: new Uint8Array(4), attrs: { _FillValue: 255 } },
    })
    await Promise.all([parseCiNC(HDF5, runtime), parseCiNC(HDF5, runtime)])
    assert.equal(runtime.files.size, 0)
    assert.equal(new Set(runtime.unlinked).size, 2)
  })
})
