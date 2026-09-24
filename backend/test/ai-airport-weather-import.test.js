import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const entry = new URL('../src/ai/tools/get-airport-weather.js', import.meta.url)
const advisoryEntry = new URL('../src/ai/tools/get-weather-advisories.js', import.meta.url)

test('1A fresh import does not fetch, listen, schedule, spawn or write', () => {
  const script = `
    import fs from 'node:fs';
    import fsp from 'node:fs/promises';
    import net from 'node:net';
    import http from 'node:http';
    import https from 'node:https';
    import cp from 'node:child_process';
    import timers from 'node:timers';
    import tp from 'node:timers/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const calls = [];
    const trap = name => () => { calls.push(name); throw Error('forbidden side effect: ' + name); };
    globalThis.fetch = trap('fetch');
    for (const name of ['setTimeout', 'setInterval', 'setImmediate']) {
      globalThis[name] = trap(name); timers[name] = trap(name); tp[name] = trap(name);
    }
    net.Server.prototype.listen = trap('listen');
    net.Socket.prototype.connect = trap('connect');
    for (const mod of [http, https]) for (const name of ['request', 'get']) mod[name] = trap(name);
    for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[name] = trap(name);
    const writes = ['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rename', 'unlink', 'rm', 'rmdir', 'copyFile', 'truncate', 'symlink', 'link', 'chmod', 'chown'];
    for (const name of writes) {
      fs[name] = trap(name); fs[name + 'Sync'] = trap(name + 'Sync'); fsp[name] = trap(name);
    }
    for (const name of ['write', 'writeSync', 'writev', 'writevSync']) fs[name] = trap(name);
    const writable = flags => typeof flags === 'number'
      ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0
      : /[wa+]/.test(flags || 'r');
    for (const [mod, name] of [[fs, 'open'], [fs, 'openSync'], [fsp, 'open']]) {
      const original = mod[name];
      mod[name] = (...args) => {
        if (writable(args[1])) return trap('open-write')();
        return original.apply(mod, args);
      };
    }
    fs.createWriteStream = trap('createWriteStream');
    syncBuiltinESMExports();
    await import(${JSON.stringify(entry.href)});
    await import(${JSON.stringify(advisoryEntry.href)});
    if (calls.length) throw Error(JSON.stringify(calls));
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 3000,
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
})

test('1A local import graph excludes application I/O owners', () => {
  const seen = new Set()
  function visit(file) {
    if (seen.has(file)) return
    seen.add(file)
    assert.doesNotMatch(file, /\/(?:config|store|server|collector|scheduler)\.js$|\/(?:processors|collectors)\//)
    assert.doesNotMatch(file, /\/frontend\//)
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) visit(path.resolve(path.dirname(file), match[1]))
    }
  }
  visit(fileURLToPath(entry))
  visit(fileURLToPath(advisoryEntry))
  assert.ok(seen.size > 5)
})
