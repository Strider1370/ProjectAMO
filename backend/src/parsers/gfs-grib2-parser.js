const TIME_UNITS_MS = new Map([[0, 60_000], [1, 3_600_000], [2, 86_400_000]])

export function readSignMagnitude16(buffer, offset) {
  const raw = buffer.readUInt16BE(offset)
  return (raw & 0x8000 ? -1 : 1) * (raw & 0x7fff)
}

function readSignMagnitude32(buffer, offset) {
  const raw = buffer.readUInt32BE(offset)
  return (raw & 0x8000_0000 ? -1 : 1) * (raw & 0x7fff_ffff)
}

export function readPackedUnsigned(buffer, startBit, bits) {
  if (!Number.isInteger(bits) || bits < 0 || bits > 32 || !Number.isInteger(startBit) || startBit < 0
      || startBit + bits > buffer.length * 8) throw new Error('grib_bit_range')
  let value = 0
  for (let index = 0; index < bits; index += 1) {
    const bit = startBit + index
    value = value * 2 + ((buffer[Math.floor(bit / 8)] >> (7 - bit % 8)) & 1)
  }
  return value
}

function utcFromSection1(section) {
  const values = [section.readUInt16BE(12), ...[14, 15, 16, 17, 18].map(offset => section[offset])]
  const [year, month, day, hour, minute, second] = values
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
      || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) throw new Error('invalid_grib_run')
  return date.toISOString()
}

function angleUnit(section) {
  const basic = section.readUInt32BE(38)
  const subdivisions = section.readUInt32BE(42)
  if (basic === 0 && subdivisions === 0xffff_ffff) return 1e-6
  if (!basic || !subdivisions || subdivisions === 0xffff_ffff) throw new Error('unsupported_grib_angle')
  return basic / subdivisions
}

function parseGrid(section) {
  if (section.readUInt16BE(12) !== 0) throw new Error('unsupported_grib_grid_template')
  const points = section.readUInt32BE(6), nx = section.readUInt32BE(30), ny = section.readUInt32BE(34)
  if (!nx || !ny || nx * ny !== points || !Number.isSafeInteger(nx * ny)) throw new Error('invalid_grib_grid')
  const unit = angleUnit(section), scan = section[71]
  if ((scan & 0x30) !== 0) throw new Error('unsupported_grib_scan')
  const firstLat = readSignMagnitude32(section, 46) * unit
  const firstLon = readSignMagnitude32(section, 50) * unit
  const lastLat = readSignMagnitude32(section, 55) * unit
  const lastLon = readSignMagnitude32(section, 59) * unit
  const di = section.readUInt32BE(63) * unit
  const dj = section.readUInt32BE(67) * unit
  const iStep = scan & 0x80 ? -di : di
  const jStep = scan & 0x40 ? dj : -dj
  const close = (a, b) => Math.abs(a - b) <= Math.max(unit, 1e-9)
  if (!close(firstLon + iStep * (nx - 1), lastLon) || !close(firstLat + jStep * (ny - 1), lastLat)) throw new Error('invalid_grib_grid')
  return { nx, ny, points, firstLat, firstLon, lastLat, lastLon, di, dj, iStep, jStep, scanningMode: scan }
}

function scaledSurface(section) {
  const scaleByte = section[23]
  const scale = (scaleByte & 0x80 ? -1 : 1) * (scaleByte & 0x7f)
  const raw = section.readUInt32BE(24)
  return raw * 10 ** (-scale)
}

function hours(value, unit) {
  const multiplier = TIME_UNITS_MS.get(unit)
  const result = multiplier === undefined ? NaN : value * multiplier / 3_600_000
  if (!Number.isInteger(result)) throw new Error('unsupported_grib_time_unit')
  return result
}

const PARAMETERS = new Map([
  ['0/3/1/101/0', ['PRMSL', 'prmsl', 'Pa', 'meanSea']],
  ['0/3/5/1/0', ['HGT', 'orog', 'm', 'surface']],
  ['0/3/5/215/0', ['HGT', 'gh', 'gpm', 'cloudCeiling']],
  ['0/19/0/1/0', ['VIS', 'vis', 'm', 'surface']],
  ['0/2/22/1/0', ['GUST', 'gust', 'm s**-1', 'surface']],
  ['0/0/0/1/0', ['TMP', 't', 'K', 'surface']],
  ['0/0/0/103/2', ['TMP', '2t', 'K', 'heightAboveGround']],
  ['0/0/6/103/2', ['DPT', '2d', 'K', 'heightAboveGround']],
  ['0/1/1/103/2', ['RH', '2r', '%', 'heightAboveGround']],
  ['0/2/2/103/10', ['UGRD', '10u', 'm s**-1', 'heightAboveGround']],
  ['0/2/3/103/10', ['VGRD', '10v', 'm s**-1', 'heightAboveGround']],
  ['0/1/8/1/0', ['APCP', 'tp', 'kg m**-2', 'surface']],
  ['0/6/1/10/0', ['TCDC', 'tcc', '%', 'atmosphere']],
  ['0/6/3/214/0', ['LCDC', 'lcc', '%', 'lowCloudLayer']],
  ['0/6/4/224/0', ['MCDC', 'mcc', '%', 'middleCloudLayer']],
  ['0/6/5/234/0', ['HCDC', 'hcc', '%', 'highCloudLayer']],
])

function parseProduct(section, discipline, run_at) {
  const template = section.readUInt16BE(7)
  if (template !== 0 && template !== 8) throw new Error('unsupported_grib_product_template')
  const category = section[9], number = section[10], unit = section[17]
  const forecast = hours(section.readUInt32BE(18), unit)
  const surfaceType = section[22], level = scaledSurface(section)
  let stepType = 'instant', startStep = forecast, endStep = forecast
  if (template === 8) {
    if (section.length < 58 || section[41] !== 1) throw new Error('unsupported_grib_statistical_ranges')
    const end = new Date(Date.UTC(section.readUInt16BE(34), section[36] - 1, section[37], section[38], section[39], section[40]))
    endStep = (end.getTime() - Date.parse(run_at)) / 3_600_000
    if (!Number.isInteger(endStep)) throw new Error('invalid_grib_valid_time')
    const stat = section[46]
    stepType = stat === 0 ? 'avg' : stat === 1 ? 'accum' : stat === 2 ? 'max' : null
    if (!stepType) throw new Error('unsupported_grib_statistic')
    const interval = hours(section.readUInt32BE(49), section[48])
    startStep = endStep - interval
    if (startStep !== forecast) throw new Error('invalid_grib_valid_time')
  }
  const definition = PARAMETERS.get(`${discipline}/${category}/${number}/${surfaceType}/${level}`)
  return { template, category, number, surfaceType, level, stepType, startStep, endStep, definition }
}

function decodeValues(section5, section6, section7, points) {
  if (section5.readUInt16BE(9) !== 0) throw new Error('unsupported_grib_packing')
  const represented = section5.readUInt32BE(5), reference = section5.readFloatBE(11)
  const binaryScale = readSignMagnitude16(section5, 15), decimalScale = readSignMagnitude16(section5, 17), bits = section5[19]
  const indicator = section6[5]
  let bitmap
  if (indicator === 255) bitmap = new Uint8Array(points).fill(1)
  else if (indicator === 0) {
    const bytes = section6.subarray(6)
    if (bytes.length * 8 < points) throw new Error('invalid_grib_bitmap_count')
    bitmap = Uint8Array.from({ length: points }, (_, i) => (bytes[i >> 3] >> (7 - (i & 7))) & 1)
  } else throw new Error('unsupported_grib_bitmap')
  const present = bitmap.reduce((sum, value) => sum + value, 0)
  if (present !== represented) throw new Error('invalid_grib_bitmap_count')
  const packed = section7.subarray(5)
  if (present * bits > packed.length * 8) throw new Error('invalid_grib_packed_count')
  const values = Array(points), factor = 2 ** binaryScale * 10 ** (-decimalScale)
  let sample = 0
  for (let index = 0; index < points; index += 1) values[index] = bitmap[index]
    ? (reference + readPackedUnsigned(packed, sample++ * bits, bits) * 2 ** binaryScale) * 10 ** (-decimalScale)
    : null
  return { values, packing: { template: 0, reference, binaryScale, decimalScale, bits, quantization: Math.abs(factor), bitmapIndicator: indicator } }
}

export function parseGfsGrib2(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('invalid_grib_buffer')
  const messages = []
  let offset = 0
  while (offset < buffer.length) {
    if (offset + 16 > buffer.length || buffer.toString('ascii', offset, offset + 4) !== 'GRIB' || buffer[offset + 7] !== 2) throw new Error('invalid_grib_message')
    const totalBig = buffer.readBigUInt64BE(offset + 8)
    if (totalBig > BigInt(buffer.length - offset) || totalBig < 20n || totalBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('grib_message_length')
    const end = offset + Number(totalBig)
    if (buffer.toString('ascii', end - 4, end) !== '7777') throw new Error('grib_end_marker')
    const discipline = buffer[offset + 6]
    let cursor = offset + 16, run_at, grid, product, section5, section6
    while (cursor < end - 4) {
      if (cursor + 5 > end - 4) throw new Error('grib_section_length')
      const length = buffer.readUInt32BE(cursor), number = buffer[cursor + 4]
      if (length < 5 || cursor + length > end - 4) throw new Error('grib_section_length')
      const section = buffer.subarray(cursor, cursor + length)
      if (number === 1) run_at = utcFromSection1(section)
      else if (number === 3) grid = parseGrid(section)
      else if (number === 4) {
        if (!run_at || !grid) throw new Error('missing_grib_metadata')
        product = parseProduct(section, discipline, run_at); section5 = section6 = undefined
      } else if (number === 5) section5 = section
      else if (number === 6) section6 = section
      else if (number === 7) {
        if (!product || !section5 || !section6) throw new Error('missing_grib_field_section')
        const decoded = decodeValues(section5, section6, section, grid.points)
        if (product.definition) {
          const [parameter, baseShortName, units, typeOfLevel] = product.definition
          const shortName = product.stepType === 'avg' && baseShortName !== 'tcc' ? `avg_${baseShortName}` : baseShortName
          messages.push({ parameter, shortName, units, typeOfLevel, level: product.level, discipline,
            category: product.category, number: product.number, stepType: product.stepType,
            startStep: product.startStep, endStep: product.endStep, run_at, grid, ...decoded })
        }
        product = section5 = section6 = undefined
      }
      cursor += length
    }
    if (cursor !== end - 4) throw new Error('grib_section_length')
    offset = end
  }
  return messages
}

export function sampleGfsMessage(message, airport) {
  if (!Number.isFinite(airport?.lat) || !Number.isFinite(airport?.lon)) throw new Error('invalid_gfs_sample_point')
  const { grid } = message
  let lon = airport.lon
  while (lon - grid.firstLon > 180) lon -= 360
  while (lon - grid.firstLon < -180) lon += 360
  if (lon < Math.min(grid.firstLon,grid.lastLon) || lon > Math.max(grid.firstLon,grid.lastLon)
    || airport.lat < Math.min(grid.firstLat,grid.lastLat) || airport.lat > Math.max(grid.firstLat,grid.lastLat)) return null
  const i = Math.round((lon - grid.firstLon) / grid.iStep)
  const j = Math.round((airport.lat - grid.firstLat) / grid.jStep)
  if (i < 0 || i >= grid.nx || j < 0 || j >= grid.ny) return null
  const value = message.values[j * grid.nx + i]
  return { value, grid_lat: grid.firstLat + j * grid.jStep, grid_lon: grid.firstLon + i * grid.iStep }
}
