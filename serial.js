// TODO after
module.exports = test => {
  let hasOnly = false
  let started = false
  const listeners = new Map()
  const on = (ev, fn) => listeners.set(ev, fn)
  const emit = (ev, val) => listeners.get(ev) && listeners.get(ev)(val)
  const queue = []

  async function drain () {
    if (!queue.length || hasOnly) {
      started = false
      emit('done')
      return
    }
    await queue.shift()()
    drain()
  }

  const only = test.only

  test.only = (name, fn) => {
    hasOnly = true
    only(name, async () => {
      await fn()
      emit('done')
    })
  }

  const run = test.run

  test.run = async () => {
    await run()
    await new Promise(y => on('done', y))
  }

  test.serial = (name, fn) => {
    const resolver = new Promise((y, n) => on(fn, e => (e ? n(e) : y())))

    queue.push(async () => {
      try {
        await fn()
        emit(fn)
      } catch (e) {
        emit(fn, e)
      }
    })

    test(name, async () => {
      // on run(), starts the queue
      if (!started) {
        started = true
        drain()
      }

      await resolver
    })
  }

  return test
}
