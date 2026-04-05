document$.subscribe(function() {
    var tables = document.querySelectorAll("article table:not([class])")
    tables.forEach(function(table) {
      new Tablesort(table)
    })
  })

document$.subscribe(function() {
  var paletteRoot = document.querySelector("[data-md-component=palette]")
  if (!paletteRoot) {
    return
  }

  if (paletteRoot.dataset.mdPaletteScrollLockBound === "1") {
    return
  }
  paletteRoot.dataset.mdPaletteScrollLockBound = "1"

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual"
  }

  var scrollStateStorageKey = "__md_palette_scroll_state"

  function captureScrollState() {
    var scrollingElement = document.scrollingElement || document.documentElement
    var sidebars = Array.prototype.slice.call(
      document.querySelectorAll(".md-sidebar__scrollwrap")
    ).map(function(el) {
      return { el: el, top: el.scrollTop, left: el.scrollLeft }
    })

    return {
      windowTop: window.scrollY,
      windowLeft: window.scrollX,
      scrollingElement: scrollingElement,
      mainTop: scrollingElement ? scrollingElement.scrollTop : 0,
      mainLeft: scrollingElement ? scrollingElement.scrollLeft : 0,
      sidebars: sidebars
    }
  }

  function restoreScrollState(state) {
    if (!state) {
      return
    }

    window.scrollTo({ top: state.windowTop, left: state.windowLeft, behavior: "auto" })

    if (state.scrollingElement) {
      state.scrollingElement.scrollTop = state.mainTop
      state.scrollingElement.scrollLeft = state.mainLeft
    }

    if (state.sidebars && state.sidebars.length) {
      state.sidebars.forEach(function(entry) {
        if (!entry || !entry.el) {
          return
        }
        entry.el.scrollTop = entry.top
        entry.el.scrollLeft = entry.left
      })
    }
  }

  function freezeViewport(state) {
    if (!state) {
      return function() {}
    }

    var body = document.body
    if (!body) {
      return function() {}
    }

    var prevPosition = body.style.position
    var prevTop = body.style.top
    var prevLeft = body.style.left
    var prevRight = body.style.right
    var prevWidth = body.style.width
    var prevOverflowY = document.documentElement.style.overflowY

    body.style.position = "fixed"
    body.style.top = (-state.windowTop) + "px"
    body.style.left = "0"
    body.style.right = "0"
    body.style.width = "100%"
    document.documentElement.style.overflowY = "scroll"

    return function() {
      var top = body.style.top
      body.style.position = prevPosition
      body.style.top = prevTop
      body.style.left = prevLeft
      body.style.right = prevRight
      body.style.width = prevWidth
      document.documentElement.style.overflowY = prevOverflowY

      var y = 0
      if (top && top.endsWith("px")) {
        y = -parseInt(top, 10)
      }
      window.scrollTo({ top: y, left: 0, behavior: "auto" })
    }
  }

  function applyScrollFix(state) {
    if (!state) {
      return
    }

    var canceled = false
    function cancel() { canceled = true }

    try {
      window.addEventListener("wheel", cancel, { passive: true, capture: true, once: true })
      window.addEventListener("touchmove", cancel, { passive: true, capture: true, once: true })
    } catch (e) {
    }

    ;[0, 16, 50, 120].forEach(function(delayMs) {
      setTimeout(function() {
        if (canceled) {
          return
        }

        var delta = Math.abs(window.scrollY - state.windowTop)
        if (delta > 6) {
          restoreScrollState(state)
        }
      }, delayMs)
    })
  }

  var pendingState = null
  var armedAt = 0

  function restoreFromSession() {
    try {
      var raw = sessionStorage.getItem(scrollStateStorageKey)
      if (!raw) {
        return
      }
      sessionStorage.removeItem(scrollStateStorageKey)
      var data = JSON.parse(raw)
      if (!data || typeof data.windowTop !== "number") {
        return
      }
      applyScrollFix({
        windowTop: data.windowTop,
        windowLeft: data.windowLeft || 0,
        scrollingElement: document.scrollingElement || document.documentElement,
        mainTop: data.mainTop || 0,
        mainLeft: data.mainLeft || 0,
        sidebars: []
      })
    } catch (e) {
    }
  }

  function armScrollLock() {
    var now = performance.now()
    if (now - armedAt < 250) {
      return
    }
    armedAt = now

    pendingState = captureScrollState()
    var unfreeze = freezeViewport(pendingState)
    try {
      sessionStorage.setItem(scrollStateStorageKey, JSON.stringify({
        windowTop: pendingState.windowTop,
        windowLeft: pendingState.windowLeft,
        mainTop: pendingState.mainTop,
        mainLeft: pendingState.mainLeft,
        at: Date.now()
      }))
    } catch (e) {
    }

    applyScrollFix(pendingState)
    setTimeout(function() { unfreeze() }, 120)
  }

  restoreFromSession()

  ;["pointerdown", "mousedown", "touchstart", "keydown"].forEach(function(eventType) {
    paletteRoot.addEventListener(eventType, armScrollLock, true)
  })

  paletteRoot.addEventListener("change", function() {
    applyScrollFix(pendingState || captureScrollState())
  }, true)
})
