var I = Object.create
var p = Object.defineProperty
var M = Object.getOwnPropertyDescriptor
var _ = Object.getOwnPropertyNames
var q = Object.getPrototypeOf,
  H = Object.prototype.hasOwnProperty
var E = (e) => p(e, '__esModule', { value: !0 })
var $ = (e, n) => {
    E(e)
    for (var r in n) p(e, r, { get: n[r], enumerable: !0 })
  },
  D = (e, n, r) => {
    if ((n && typeof n == 'object') || typeof n == 'function')
      for (let s of _(n))
        !H.call(e, s) && s !== 'default' && p(e, s, { get: () => n[s], enumerable: !(r = M(n, s)) || r.enumerable })
    return e
  },
  f = (e) =>
    D(
      E(
        p(
          e != null ? I(q(e)) : {},
          'default',
          e && e.__esModule && 'default' in e ? { get: () => e.default, enumerable: !0 } : { value: e, enumerable: !0 }
        )
      ),
      e
    )
$(exports, {
  cleanCodeForParsing: () => k,
  clearCacheUp: () => v,
  create: () => G,
  createEmitter: () => C,
  findTopmostParents: () => y,
  getChildrenModuleIds: () => A,
  remove: () => g,
  resolveAliases: () => R,
  walk: () => d,
})
var O = f(require('fs')),
  h = f(require('path')),
  T = f(require('module')),
  x = f(require('es-module-lexer')),
  P = f(require('strip-comments')),
  b = f(require('filewatcher')),
  w = f(require('lodash')),
  F = /(?<![^;\n])[ ]*import(?:["'\s]*([\w*${}\n\r\t, ]+)\s*from\s*)?\s*["'](.*?)["']/gm,
  S = /(?<!\.)\bimport\((?:['"].+['"]|`[^$]+`)\)/gm
function C() {
  let e = {}
  function n(i, c) {
    e[i] && e[i].forEach((t) => t(c)), e['*'] && e['*'].forEach((t) => t(c))
  }
  function r(i, c) {
    return (
      (e[i] = e[i] ? e[i].concat(c) : [c]),
      () => {
        e[i].splice(e[i].indexOf(c), 1)
      }
    )
  }
  function s() {
    e = {}
  }
  function o(i) {
    return e[i] || []
  }
  return { clear: s, emit: n, on: r, listeners: o }
}
function R(e, n = {}) {
  for (let r of Object.keys(n)) if (e.indexOf(r) === 0) return (n[r] + e.replace(r, '')).replace(/\/+/g, '/')
  return e
}
function k(e) {
  e = (0, P.default)(e)
  let n = [],
    r,
    s = new RegExp(F)
  for (; (r = s.exec(e)); ) n.push(r)
  let o = new RegExp(S)
  for (; (r = o.exec(e)); ) n.push(r)
  return n.map(([i]) => i).join(`
`)
}
async function A(e, n = {}) {
  let r = O.default.readFileSync(e, 'utf-8'),
    s = []
  try {
    s = (await (0, x.parse)(r))[0].map((o) => o.n)
  } catch {
    s = (await (0, x.parse)(k(r)))[0].map((i) => i.n)
  }
  return s
    .map((o) => {
      let i = (0, T.createRequire)(e),
        c
      try {
        c = i.resolve(o)
      } catch {
        try {
          c = i.resolve(R(o, n.alias))
        } catch {
          c = require.resolve(o)
        }
      }
      return c === o ? void 0 : c
    })
    .filter(Boolean)
}
async function d(e, n, r = {}) {
  let s = /^\.(j|t)sx?$/.test(h.default.extname(e))
  n[e] = n[e] || { entry: !0, parents: [], children: [] }
  let o = n[e].children,
    i = s ? await A(e, r) : [],
    c = (0, w.difference)(o, i)
  for (let t of c) n[t].parents.splice(n[t].parents.indexOf(e), 1), !n[t].parents.length && !n[t].entry && g(t, n)
  n[e].children = i
  for (let t of n[e].children)
    (n[t] = n[t] || { entry: !1, parents: [], children: [] }),
      !n[t].parents.includes(e) && (n[t].parents.push(e), await d(t, n, r))
  return n
}
function g(e, n) {
  let { parents: r, children: s } = n[e]
  for (let o of r) n[o].children.splice(n[o].children.indexOf(e), 1)
  for (let o of s) n[o].parents.splice(n[o].parents.indexOf(e), 1), n[o].parents.length || g(o, n)
  delete n[e]
}
function v(e, n) {
  delete require.cache[e]
  for (let r of n[e].parents) v(r, n)
}
function y(e, n, r = []) {
  if (r.includes(e)) return r
  let { entry: s, parents: o } = n[e]
  s && r.push(e)
  for (let i of o) y(i, n, r)
  return r
}
function G(e = {}) {
  let n = {},
    r = (0, b.default)(),
    s = C()
  function o(t) {
    s.emit('error', t), s.listeners('error').length || console.error(t)
  }
  function i(t) {
    return h.default.isAbsolute(t) ? !0 : (o(`Cannot add or remove relative path ${t}`), !1)
  }
  async function c(t) {
    let a = r.list()
    if (a.includes(t)) return
    r.add(t)
    let l = Date.now()
    await new Promise((m, u) => {
      let j = setInterval(() => {
        r.list().length > a.length && (clearInterval(j), m(!0)), Date.now() - l > 2e3 && u(!1)
      }, 10)
    })
  }
  return (
    r.on('change', async (t, a) => {
      if ((v(t, n), a.deleted)) {
        n[t].entry ? s.emit('remove', [t]) : s.emit('change', y(t, n)), r.remove(t)
        try {
          g(t, n)
        } catch (m) {
          o(m)
        }
      } else {
        let l = Object.keys(n)
        try {
          await d(t, n, e)
        } catch (u) {
          o(u)
        }
        let m = Object.keys(n)
        ;(0, w.difference)(l, m).forEach((u) => r.remove(u)), await Promise.all(m.map(c)), s.emit('change', y(t, n))
      }
    }),
    {
      get tree() {
        return Object.assign({}, n)
      },
      on(t, a) {
        return s.on(t, a)
      },
      close() {
        s.clear(), r.removeAll()
      },
      async add(t) {
        let a = [].concat(t).filter((l) => !n[l] && i(l))
        if (!!a.length) {
          for (let l of a)
            try {
              await d(l, n, e)
            } catch (m) {
              o(m)
            }
          await Promise.all(Object.keys(n).map(c)), s.emit('add', a)
        }
      },
      remove(t) {
        let a = [].concat(t).filter((l) => n[l] && i(l))
        for (let l of a) !n[l].entry || g(l, n)
        s.emit('remove', a)
      },
    }
  )
}
0 &&
  (module.exports = {
    cleanCodeForParsing,
    clearCacheUp,
    create,
    createEmitter,
    findTopmostParents,
    getChildrenModuleIds,
    remove,
    resolveAliases,
    walk,
  })
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vaW5kZXgudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCBmcyBmcm9tICdmcydcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnXG5pbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSAnbW9kdWxlJ1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICdlcy1tb2R1bGUtbGV4ZXInXG4vLyBAdHMtaWdub3JlXG5pbXBvcnQgc3RyaXBDb21tZW50cyBmcm9tICdzdHJpcC1jb21tZW50cydcbi8vIEB0cy1pZ25vcmVcbmltcG9ydCBmaWxld2F0Y2hlciBmcm9tICdmaWxld2F0Y2hlcidcbmltcG9ydCB7IGRpZmZlcmVuY2UgfSBmcm9tICdsb2Rhc2gnXG5cbmV4cG9ydCB0eXBlIEFsaWFzID0geyBbYWxpYXM6IHN0cmluZ106IHN0cmluZyB9XG5cbmV4cG9ydCB0eXBlIE9wdGlvbnMgPSB7XG4gIGFsaWFzPzogQWxpYXNcbn1cblxuZXhwb3J0IHR5cGUgVHJlZSA9IHtcbiAgW2ZpbGVuYW1lOiBzdHJpbmddOiB7XG4gICAgZW50cnk6IGJvb2xlYW5cbiAgICBwYXJlbnRzOiBzdHJpbmdbXVxuICAgIGNoaWxkcmVuOiBzdHJpbmdbXVxuICB9XG59XG5cbnR5cGUgRXZlbnRIYW5kbGVyPFQgPSB1bmtub3duPiA9IChkYXRhOiBUKSA9PiB2b2lkXG5cbmNvbnN0IEVTTV9JTVBPUlRfUkVHRVggPSAvKD88IVteO1xcbl0pWyBdKmltcG9ydCg/OltcIidcXHNdKihbXFx3KiR7fVxcblxcclxcdCwgXSspXFxzKmZyb21cXHMqKT9cXHMqW1wiJ10oLio/KVtcIiddL2dtXG5jb25zdCBFU01fRFlOQU1JQ19JTVBPUlRfUkVHRVggPSAvKD88IVxcLilcXGJpbXBvcnRcXCgoPzpbJ1wiXS4rWydcIl18YFteJF0rYClcXCkvZ21cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUVtaXR0ZXIoKSB7XG4gIGxldCBldmVudHM6IHsgW2V2ZW50OiBzdHJpbmddOiBFdmVudEhhbmRsZXI8YW55PltdIH0gPSB7fVxuXG4gIGZ1bmN0aW9uIGVtaXQ8VD4oZXZlbnQ6IHN0cmluZywgZGF0YT86IFQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnRzW2V2ZW50XSkgZXZlbnRzW2V2ZW50XS5mb3JFYWNoKChoYW5kbGVyKSA9PiBoYW5kbGVyKGRhdGEpKVxuICAgIGlmIChldmVudHNbJyonXSkgZXZlbnRzWycqJ10uZm9yRWFjaCgoaGFuZGxlcikgPT4gaGFuZGxlcihkYXRhKSlcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uPFQgPSB1bmtub3duPihldmVudDogc3RyaW5nLCBoYW5kbGVyOiBFdmVudEhhbmRsZXI8VD4pIHtcbiAgICBldmVudHNbZXZlbnRdID0gZXZlbnRzW2V2ZW50XSA/IGV2ZW50c1tldmVudF0uY29uY2F0KGhhbmRsZXIpIDogW2hhbmRsZXJdXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIGV2ZW50c1tldmVudF0uc3BsaWNlKGV2ZW50c1tldmVudF0uaW5kZXhPZihoYW5kbGVyKSwgMSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhcigpIHtcbiAgICBldmVudHMgPSB7fVxuICB9XG5cbiAgZnVuY3Rpb24gbGlzdGVuZXJzKGV2ZW50OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gZXZlbnRzW2V2ZW50XSB8fCBbXVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGVhcixcbiAgICBlbWl0LFxuICAgIG9uLFxuICAgIGxpc3RlbmVycyxcbiAgfVxufVxuXG4vKlxuICogU2ltcGxlIGFsaWFzIHJlc29sdmVyIGkuZS5cbiAqXG4gKiAgICB7XG4gKiAgICAgICdAJzogcHJvY2Vzcy5jd2QoKVxuICogICAgfVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUFsaWFzZXMoZmlsZXBhdGg6IHN0cmluZywgYWxpYXM6IEFsaWFzID0ge30pIHtcbiAgZm9yIChjb25zdCBhIG9mIE9iamVjdC5rZXlzKGFsaWFzKSkge1xuICAgIGlmIChmaWxlcGF0aC5pbmRleE9mKGEpID09PSAwKSB7XG4gICAgICAvLyBUT0RPIHN1cHBvcnQgd2luZG93cyB3aXRoIHBhdGguc2VwKClcbiAgICAgIHJldHVybiAoYWxpYXNbYV0gKyBmaWxlcGF0aC5yZXBsYWNlKGEsICcnKSkucmVwbGFjZSgvXFwvKy9nLCAnLycpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZpbGVwYXRoXG59XG5cbi8qKlxuICogTGlmdGVkIGZyb20gc25vd3BhY2ssIHByb3BzIHRvIHRoZWlyIHRlYW1cbiAqXG4gKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9zbm93cGFja2pzL3Nub3dwYWNrL2Jsb2IvZjc1ZGUxMzc1ZmUxNDE1NTY3NDExMmQ4OGJmMjExY2EzNzIxYWM3Yy9zbm93cGFjay9zcmMvc2Nhbi1pbXBvcnRzLnRzI0wxMTlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsZWFuQ29kZUZvclBhcnNpbmcoY29kZTogc3RyaW5nKSB7XG4gIGNvZGUgPSBzdHJpcENvbW1lbnRzKGNvZGUpXG4gIGNvbnN0IGFsbE1hdGNoZXMgPSBbXVxuICBsZXQgbWF0Y2hcbiAgY29uc3QgaW1wb3J0UmVnZXggPSBuZXcgUmVnRXhwKEVTTV9JTVBPUlRfUkVHRVgpXG4gIHdoaWxlICgobWF0Y2ggPSBpbXBvcnRSZWdleC5leGVjKGNvZGUpKSkge1xuICAgIGFsbE1hdGNoZXMucHVzaChtYXRjaClcbiAgfVxuICBjb25zdCBkeW5hbWljSW1wb3J0UmVnZXggPSBuZXcgUmVnRXhwKEVTTV9EWU5BTUlDX0lNUE9SVF9SRUdFWClcbiAgd2hpbGUgKChtYXRjaCA9IGR5bmFtaWNJbXBvcnRSZWdleC5leGVjKGNvZGUpKSkge1xuICAgIGFsbE1hdGNoZXMucHVzaChtYXRjaClcbiAgfVxuICByZXR1cm4gYWxsTWF0Y2hlcy5tYXAoKFtmdWxsXSkgPT4gZnVsbCkuam9pbignXFxuJylcbn1cblxuLypcbiAqIFJlYWQgZmlsZSwgcGFyc2UsIHRyYXZlcnNlLCByZXNvbHZlIGNoaWxkcmVuIG1vZHVsZXMgSURzXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDaGlsZHJlbk1vZHVsZUlkcyhmaWxlcGF0aDogc3RyaW5nLCBvcHRpb25zOiBPcHRpb25zID0ge30pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGNvbnN0IHJhdyA9IGZzLnJlYWRGaWxlU3luYyhmaWxlcGF0aCwgJ3V0Zi04JylcbiAgbGV0IGNoaWxkcmVuOiBzdHJpbmdbXSA9IFtdXG5cbiAgdHJ5IHtcbiAgICBjaGlsZHJlbiA9IChhd2FpdCBwYXJzZShyYXcpKVswXS5tYXAoKGkpID0+IGkubikgYXMgc3RyaW5nW11cbiAgfSBjYXRjaCAoZSkge1xuICAgIGNoaWxkcmVuID0gKGF3YWl0IHBhcnNlKGNsZWFuQ29kZUZvclBhcnNpbmcocmF3KSkpWzBdLm1hcCgoaSkgPT4gaS5uKSBhcyBzdHJpbmdbXVxuICB9XG5cbiAgcmV0dXJuIGNoaWxkcmVuXG4gICAgLm1hcCgoY2hpbGRGaWxlcGF0aCkgPT4ge1xuICAgICAgY29uc3QgcmVxID0gY3JlYXRlUmVxdWlyZShmaWxlcGF0aClcbiAgICAgIGxldCByZXNvbHZlZFxuXG4gICAgICB0cnkge1xuICAgICAgICByZXNvbHZlZCA9IHJlcS5yZXNvbHZlKGNoaWxkRmlsZXBhdGgpXG4gICAgICB9IGNhdGNoIChlMSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlc29sdmVkID0gcmVxLnJlc29sdmUocmVzb2x2ZUFsaWFzZXMoY2hpbGRGaWxlcGF0aCwgb3B0aW9ucy5hbGlhcykpXG4gICAgICAgIH0gY2F0Y2ggKGUyKSB7XG4gICAgICAgICAgcmVzb2x2ZWQgPSByZXF1aXJlLnJlc29sdmUoY2hpbGRGaWxlcGF0aClcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBzYW1lIHNhbWUsIG11c3QgYmUgYnVpbHQtaW4gbW9kdWxlXG4gICAgICByZXR1cm4gcmVzb2x2ZWQgPT09IGNoaWxkRmlsZXBhdGggPyB1bmRlZmluZWQgOiByZXNvbHZlZFxuICAgIH0pXG4gICAgLmZpbHRlcihCb29sZWFuKSBhcyBzdHJpbmdbXVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FsayhmaWxlcGF0aDogc3RyaW5nLCB0cmVlOiBUcmVlLCBvcHRpb25zOiBPcHRpb25zID0ge30pIHtcbiAgY29uc3QgaXNXYWxrYWJsZSA9IC9eXFwuKGp8dClzeD8kLy50ZXN0KHBhdGguZXh0bmFtZShmaWxlcGF0aCkpXG5cbiAgdHJlZVtmaWxlcGF0aF0gPSB0cmVlW2ZpbGVwYXRoXSB8fCB7XG4gICAgZW50cnk6IHRydWUsXG4gICAgcGFyZW50czogW10sXG4gICAgY2hpbGRyZW46IFtdLFxuICB9XG5cbiAgY29uc3QgcHJldkNoaWxkcmVuID0gdHJlZVtmaWxlcGF0aF0uY2hpbGRyZW5cbiAgY29uc3QgbmV4dENoaWxkcmVuID0gaXNXYWxrYWJsZSA/IGF3YWl0IGdldENoaWxkcmVuTW9kdWxlSWRzKGZpbGVwYXRoLCBvcHRpb25zKSA6IFtdXG4gIGNvbnN0IHJlbW92ZWRDaGlsZHJlbiA9IGRpZmZlcmVuY2UocHJldkNoaWxkcmVuLCBuZXh0Q2hpbGRyZW4pXG5cbiAgZm9yIChjb25zdCByZW1vdmVkQ2hpbGQgb2YgcmVtb3ZlZENoaWxkcmVuKSB7XG4gICAgdHJlZVtyZW1vdmVkQ2hpbGRdLnBhcmVudHMuc3BsaWNlKHRyZWVbcmVtb3ZlZENoaWxkXS5wYXJlbnRzLmluZGV4T2YoZmlsZXBhdGgpLCAxKVxuXG4gICAgLy8gaWYgbm8gcGFyZW50cyAmIG5vdCBhbiBlbnRyeSwgcmVtb3ZlIHRoaXMgZmlsZSBlbnRpcmVseVxuICAgIGlmICghdHJlZVtyZW1vdmVkQ2hpbGRdLnBhcmVudHMubGVuZ3RoICYmICF0cmVlW3JlbW92ZWRDaGlsZF0uZW50cnkpIHtcbiAgICAgIHJlbW92ZShyZW1vdmVkQ2hpbGQsIHRyZWUpXG4gICAgfVxuICB9XG5cbiAgdHJlZVtmaWxlcGF0aF0uY2hpbGRyZW4gPSBuZXh0Q2hpbGRyZW5cblxuICBmb3IgKGNvbnN0IGZwIG9mIHRyZWVbZmlsZXBhdGhdLmNoaWxkcmVuKSB7XG4gICAgLy8gbXVzdCBjcmVhdGUgYSBsZWFmIGZvciBlYWNoIGNoaWxkIHNvIHRoYXQgZW50cnkgPSBmYWxzZVxuICAgIHRyZWVbZnBdID0gdHJlZVtmcF0gfHwge1xuICAgICAgZW50cnk6IGZhbHNlLFxuICAgICAgcGFyZW50czogW10sXG4gICAgICBjaGlsZHJlbjogW10sXG4gICAgfVxuXG4gICAgLy8gZXhpdHMgY2lyY3VsYXIgcmVmc1xuICAgIGNvbnN0IGFscmVhZHlWaXNpdGVkRnJvbVBhcmVudCA9IHRyZWVbZnBdLnBhcmVudHMuaW5jbHVkZXMoZmlsZXBhdGgpXG5cbiAgICBpZiAoYWxyZWFkeVZpc2l0ZWRGcm9tUGFyZW50KSB7XG4gICAgICBjb250aW51ZVxuICAgIH0gZWxzZSB7XG4gICAgICB0cmVlW2ZwXS5wYXJlbnRzLnB1c2goZmlsZXBhdGgpXG5cbiAgICAgIGF3YWl0IHdhbGsoZnAsIHRyZWUsIG9wdGlvbnMpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRyZWVcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZShmaWxlcGF0aDogc3RyaW5nLCB0cmVlOiBUcmVlKSB7XG4gIGNvbnN0IHsgcGFyZW50cywgY2hpbGRyZW4gfSA9IHRyZWVbZmlsZXBhdGhdXG5cbiAgZm9yIChjb25zdCBmcCBvZiBwYXJlbnRzKSB7XG4gICAgdHJlZVtmcF0uY2hpbGRyZW4uc3BsaWNlKHRyZWVbZnBdLmNoaWxkcmVuLmluZGV4T2YoZmlsZXBhdGgpLCAxKVxuICB9XG4gIGZvciAoY29uc3QgZnAgb2YgY2hpbGRyZW4pIHtcbiAgICB0cmVlW2ZwXS5wYXJlbnRzLnNwbGljZSh0cmVlW2ZwXS5wYXJlbnRzLmluZGV4T2YoZmlsZXBhdGgpLCAxKVxuXG4gICAgLy8gaWYgbm8gcGFyZW50cywgcmVtb3ZlIHRoaXMgZmlsZSBlbnRpcmVseVxuICAgIGlmICghdHJlZVtmcF0ucGFyZW50cy5sZW5ndGgpIHtcbiAgICAgIHJlbW92ZShmcCwgdHJlZSlcbiAgICB9XG4gIH1cblxuICBkZWxldGUgdHJlZVtmaWxlcGF0aF1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyQ2FjaGVVcChmaWxlcGF0aDogc3RyaW5nLCB0cmVlOiBUcmVlKSB7XG4gIGRlbGV0ZSByZXF1aXJlLmNhY2hlW2ZpbGVwYXRoXVxuXG4gIGZvciAoY29uc3QgZnAgb2YgdHJlZVtmaWxlcGF0aF0ucGFyZW50cykge1xuICAgIGNsZWFyQ2FjaGVVcChmcCwgdHJlZSlcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZFRvcG1vc3RQYXJlbnRzKGZpbGVwYXRoOiBzdHJpbmcsIHRyZWU6IFRyZWUsIHZpc2l0ZWQ6IHN0cmluZ1tdID0gW10pOiBzdHJpbmdbXSB7XG4gIGlmICh2aXNpdGVkLmluY2x1ZGVzKGZpbGVwYXRoKSkgcmV0dXJuIHZpc2l0ZWRcblxuICBjb25zdCB7IGVudHJ5LCBwYXJlbnRzIH0gPSB0cmVlW2ZpbGVwYXRoXVxuXG4gIGlmIChlbnRyeSkge1xuICAgIHZpc2l0ZWQucHVzaChmaWxlcGF0aClcbiAgfVxuXG4gIGZvciAoY29uc3QgcGFyZW50IG9mIHBhcmVudHMpIHtcbiAgICBmaW5kVG9wbW9zdFBhcmVudHMocGFyZW50LCB0cmVlLCB2aXNpdGVkKVxuICB9XG5cbiAgcmV0dXJuIHZpc2l0ZWRcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZShvcHRpb25zOiBPcHRpb25zID0ge30pIHtcbiAgbGV0IHRyZWU6IFRyZWUgPSB7fVxuICBjb25zdCB3YXRjaGVyID0gZmlsZXdhdGNoZXIoKVxuICBjb25zdCBlbWl0dGVyID0gY3JlYXRlRW1pdHRlcigpXG5cbiAgZnVuY3Rpb24gaGFuZGxlRXJyb3IoZTogYW55KSB7XG4gICAgZW1pdHRlci5lbWl0KCdlcnJvcicsIGUpXG4gICAgaWYgKCFlbWl0dGVyLmxpc3RlbmVycygnZXJyb3InKS5sZW5ndGgpIGNvbnNvbGUuZXJyb3IoZSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzQWJzb2x1dGVQYXRoKGZpbGVwYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAoIXBhdGguaXNBYnNvbHV0ZShmaWxlcGF0aCkpIHtcbiAgICAgIGhhbmRsZUVycm9yKGBDYW5ub3QgYWRkIG9yIHJlbW92ZSByZWxhdGl2ZSBwYXRoICR7ZmlsZXBhdGh9YClcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlXG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiB3YXRjaEZpbGVwYXRoKGZpbGVwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCB3YXRjaGVkRmlsZXMgPSB3YXRjaGVyLmxpc3QoKVxuXG4gICAgaWYgKHdhdGNoZWRGaWxlcy5pbmNsdWRlcyhmaWxlcGF0aCkpIHJldHVyblxuXG4gICAgLyoqXG4gICAgICogdGhpcyBpcyBhbiBhc3luYyBmdW5jdGlvbiwgYnV0IG9sZCBlbm91Z2ggdGhhdCBhc3luYyB3YXNuJ3QgY29tbW9ubHlcbiAgICAgKiBoYW5kbGVkIGluIG5vZGUsIHNvIHdlIG5lZWQgdG8gZmFrZSBpdFxuICAgICAqXG4gICAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vZmduYXNzL2ZpbGV3YXRjaGVyL2Jsb2IvbWFzdGVyL2luZGV4LmpzI0wzNlxuICAgICAqL1xuICAgIHdhdGNoZXIuYWRkKGZpbGVwYXRoKVxuXG4gICAgY29uc3QgdGhlbiA9IERhdGUubm93KClcblxuICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgICAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIC8qXG4gICAgICAgICAqIGFkZGVkIGZpbGVzIG1heSBiIHNpbmdsZSBlbnRyeSwgYnV0IGhhdmUgY2hpbGQgbW9kdWxlcyBzbyB3ZSdyZSBqdXN0XG4gICAgICAgICAqIGxvb2tpbmcgZm9yIGFuIGluY3JlYXNlIGluIHRoZSBvdmVyYWxsIHdhdGNoZWQgZmlsZSBjb3VudFxuICAgICAgICAgKi9cbiAgICAgICAgaWYgKHdhdGNoZXIubGlzdCgpLmxlbmd0aCA+IHdhdGNoZWRGaWxlcy5sZW5ndGgpIHtcbiAgICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsKVxuICAgICAgICAgIHJlcyh0cnVlKVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGltZW91dCBhZnRlciAyc1xuICAgICAgICBpZiAoRGF0ZS5ub3coKSAtIHRoZW4gPiAyMDAwKSByZWooZmFsc2UpXG4gICAgICB9LCAxMClcbiAgICB9KVxuICB9XG5cbiAgd2F0Y2hlci5vbignY2hhbmdlJywgYXN5bmMgKGZpbGU6IHN0cmluZywgc3RhdDogYW55KSA9PiB7XG4gICAgLy8gZmlyc3QgY2xlYXIgY2FjaGUgdXAgdGhlIHRyZWVcbiAgICBjbGVhckNhY2hlVXAoZmlsZSwgdHJlZSlcblxuICAgIGlmIChzdGF0LmRlbGV0ZWQpIHtcbiAgICAgIGNvbnN0IGVudHJ5ID0gdHJlZVtmaWxlXS5lbnRyeVxuXG4gICAgICBpZiAoZW50cnkpIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdyZW1vdmUnLCBbZmlsZV0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbWl0dGVyLmVtaXQoJ2NoYW5nZScsIGZpbmRUb3Btb3N0UGFyZW50cyhmaWxlLCB0cmVlKSlcbiAgICAgIH1cblxuICAgICAgd2F0Y2hlci5yZW1vdmUoZmlsZSlcblxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVtb3ZlKGZpbGUsIHRyZWUpXG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGhhbmRsZUVycm9yKGUpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHByZXYgPSBPYmplY3Qua2V5cyh0cmVlKVxuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBvbiBjaGFuZ2UsIG1ha2Ugc3VyZSB0byByZS13YWxrIGxlYWZcbiAgICAgICAgYXdhaXQgd2FsayhmaWxlLCB0cmVlLCBvcHRpb25zKVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBoYW5kbGVFcnJvcihlKVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuZXh0ID0gT2JqZWN0LmtleXModHJlZSlcblxuICAgICAgLy8gcmVtb3ZlIGFueXRoaW5nIHRoYXQgY2hhbmdlZFxuICAgICAgZGlmZmVyZW5jZShwcmV2LCBuZXh0KS5mb3JFYWNoKChmaWxlcGF0aCkgPT4gd2F0Y2hlci5yZW1vdmUoZmlsZXBhdGgpKVxuICAgICAgLy8gd2F0Y2ggYWxsIHBhdGhzLCB3YXRjaEZpbGVwYXRoICYgZmlsZXdhdGNoZXIgZGVkdXBlXG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChuZXh0Lm1hcCh3YXRjaEZpbGVwYXRoKSlcblxuICAgICAgLy8gYWxlcnQgbGlzdGVuZXJzIG9mIGNoYW5nZSBBRlRFUiBhbGwgb3RoZXIgcHJvY2Vzc2VzXG4gICAgICBlbWl0dGVyLmVtaXQoJ2NoYW5nZScsIGZpbmRUb3Btb3N0UGFyZW50cyhmaWxlLCB0cmVlKSlcbiAgICB9XG4gIH0pXG5cbiAgcmV0dXJuIHtcbiAgICBnZXQgdHJlZSgpIHtcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCB0cmVlKVxuICAgIH0sXG4gICAgb24oZXZlbnQ6IHN0cmluZywgaGFuZGxlcjogRXZlbnRIYW5kbGVyKSB7XG4gICAgICByZXR1cm4gZW1pdHRlci5vbihldmVudCwgaGFuZGxlcilcbiAgICB9LFxuICAgIGNsb3NlKCkge1xuICAgICAgZW1pdHRlci5jbGVhcigpXG4gICAgICB3YXRjaGVyLnJlbW92ZUFsbCgpXG4gICAgfSxcbiAgICBhc3luYyBhZGQoZmlsZXBhdGhzOiBzdHJpbmcgfCBzdHJpbmdbXSkge1xuICAgICAgY29uc3QgZmlsZXMgPSAoW10gYXMgc3RyaW5nW10pLmNvbmNhdChmaWxlcGF0aHMpLmZpbHRlcigoZnApID0+ICF0cmVlW2ZwXSAmJiBpc0Fic29sdXRlUGF0aChmcCkpXG5cbiAgICAgIGlmICghZmlsZXMubGVuZ3RoKSByZXR1cm5cblxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgd2FsayhmaWxlLCB0cmVlLCBvcHRpb25zKVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgaGFuZGxlRXJyb3IoZSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChPYmplY3Qua2V5cyh0cmVlKS5tYXAod2F0Y2hGaWxlcGF0aCkpXG5cbiAgICAgIGVtaXR0ZXIuZW1pdCgnYWRkJywgZmlsZXMpXG4gICAgfSxcbiAgICByZW1vdmUoZmlsZXBhdGhzOiBzdHJpbmcgfCBzdHJpbmdbXSkge1xuICAgICAgY29uc3QgZmlsZXMgPSAoW10gYXMgc3RyaW5nW10pLmNvbmNhdChmaWxlcGF0aHMpLmZpbHRlcigoZnApID0+IHRyZWVbZnBdICYmIGlzQWJzb2x1dGVQYXRoKGZwKSlcblxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgIGlmICghdHJlZVtmaWxlXS5lbnRyeSkgY29udGludWVcblxuICAgICAgICByZW1vdmUoZmlsZSwgdHJlZSlcbiAgICAgIH1cblxuICAgICAgZW1pdHRlci5lbWl0KCdyZW1vdmUnLCBmaWxlcylcbiAgICB9LFxuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAibWxCQUFBLGtNQUFlLGlCQUNmLEVBQWlCLG1CQUNqQixFQUE4QixxQkFDOUIsRUFBc0IsOEJBRXRCLEVBQTBCLDZCQUUxQixFQUF3QiwwQkFDeEIsRUFBMkIscUJBa0JyQixFQUFtQixtRkFDbkIsRUFBMkIsOENBRTFCLFlBQXlCLENBQzlCLEdBQUksR0FBbUQsR0FFdkQsV0FBaUIsRUFBZSxFQUFnQixDQUM5QyxBQUFJLEVBQU8sSUFBUSxFQUFPLEdBQU8sUUFBUSxBQUFDLEdBQVksRUFBUSxJQUMxRCxFQUFPLE1BQU0sRUFBTyxLQUFLLFFBQVEsQUFBQyxHQUFZLEVBQVEsSUFHNUQsV0FBeUIsRUFBZSxFQUEwQixDQUNoRSxTQUFPLEdBQVMsRUFBTyxHQUFTLEVBQU8sR0FBTyxPQUFPLEdBQVcsQ0FBQyxHQUMxRCxJQUFNLENBQ1gsRUFBTyxHQUFPLE9BQU8sRUFBTyxHQUFPLFFBQVEsR0FBVSxJ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
