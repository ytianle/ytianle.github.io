/* toc-anchor-fix.js
 *
 * Problem: navigation.instant intercepts ALL internal link clicks — including
 * same-page anchor clicks (TOC entries). It calls ev.preventDefault() and then
 * triggers an XHR re-render of the page, which:
 *   1. Replaces the DOM → destroys the IntersectionObserver → TOC active
 *      highlight disappears until the next scroll event.
 *   2. Causes a visible flash because the background color briefly repaints.
 *
 * Fix (minimal — do NOT touch md-nav__link--active manually):
 *   In the capture phase, for same-page hash links only:
 *     • e.stopPropagation() — prevents the event reaching document.body where
 *       Material's bubble-phase instant-navigation listener lives.
 *     • e.preventDefault()  — prevents the browser's own native jump.
 *     • history.pushState() — update the URL bar.
 *     • window.scrollTo()   — smooth-scroll to target, accounting for the
 *       sticky header height so the heading is not hidden behind it.
 *
 *   We do NOT touch md-nav__link--active at all. Material's own
 *   IntersectionObserver (component/toc) handles that correctly once the
 *   scroll position is right — any manual override just causes lag/drift.
 */
(function () {
    if (window.__tocAnchorFixInstalled) return;
    window.__tocAnchorFixInstalled = true;

    /** Return "#hash" if href points to the current page with a fragment, else null. */
    function getSamePageHash(href) {
        if (!href) return null;
        try {
            var url = new URL(href, location.href);
            if (
                url.origin   === location.origin &&
                url.pathname === location.pathname &&
                url.search   === location.search   &&
                url.hash.length > 1
            ) {
                return url.hash;
            }
        } catch (_) {}
        return null;
    }

    /**
     * Return the scroll offset (px) to pass to window.scrollTo().
     *
     * We subtract 4px from the sticky-bar height so the heading lands
     * ABOVE Material's IntersectionObserver threshold (= header height).
     * If we added breathing room instead, the heading would stop just
     * BELOW the threshold → IO keeps the previous heading active.
     */
    function getStickyOffset() {
        var offset = 0;
        var header = document.querySelector(".md-header");
        if (header) offset += header.getBoundingClientRect().height;
        var tabs = document.querySelector(".md-tabs");
        if (tabs && getComputedStyle(tabs).position === "sticky") {
            offset += tabs.getBoundingClientRect().height;
        }
        return Math.max(0, offset - 4); // 4px above sticky bar → crosses IO threshold
    }

    function getHashTarget(hash) {
        if (!hash || hash.length <= 1) return null;

        var rawId = hash.slice(1);
        var decodedId = rawId;

        try {
            decodedId = decodeURIComponent(rawId);
        } catch (_) {}

        return document.getElementById(decodedId) || document.getElementById(rawId);
    }

    /**
     * Material exposes each tab through a fragment such as #__tabbed_1_3.
     * A full page load restores that tab from the fragment, but pushState()
     * (used below for normal anchors) deliberately doesn't emit hashchange.
     * Select the matching radio input ourselves so in-page tab links update
     * immediately as well.
     */
    function activateTabbedHash(hash) {
        var tab = getHashTarget(hash);
        if (!tab ||
            tab.tagName !== "INPUT" ||
            tab.type !== "radio" ||
            !tab.id.startsWith("__tabbed_")) {
            return false;
        }

        if (!tab.checked) {
            tab.checked = true;
            tab.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return true;
    }

    document.addEventListener("click", function (e) {
        if (e.button || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

        var anchor = e.target.closest("a[href]");
        if (!anchor) return;

        var hash = getSamePageHash(anchor.getAttribute("href"));
        if (!hash) return;

        var target = getHashTarget(hash);
        if (!target) return;

        // Tab fragments are state, not scroll targets. Handle them before the
        // generic anchor code, which otherwise only makes them work on reload.
        if (activateTabbedHash(hash)) {
            e.preventDefault();
            e.stopPropagation();
            history.pushState(null, "", hash);
            return;
        }

        // Stop Material's bubble-phase instant-navigation handler from firing.
        e.preventDefault();
        e.stopPropagation();

        // Update the URL bar without triggering any navigation.
        history.pushState(null, "", hash);

        var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var rawTop = target.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({
            top: Math.max(0, rawTop - getStickyOffset()),
            behavior: prefersReducedMotion ? "auto" : "smooth"
        });

        // Material's IO updates the active state as the smooth scroll progresses.

    }, true /* capture phase */);

    // Also support pasted URLs plus Back/Forward navigation between tabs.
    function syncTabbedHash() {
        activateTabbedHash(location.hash);
    }

    window.addEventListener("hashchange", syncTabbedHash);
    window.addEventListener("popstate", syncTabbedHash);
    syncTabbedHash();

    /* ── Early TOC detection: fire ADVANCE px before Material's own IO ────
     *
     * Material's IO rootMargin = -headerHeight (~48px): highlights a heading
     * only when its top reaches 48px from the viewport top — too late.
     * We run a second IO with rootMargin = -(headerHeight + ADVANCE), so the
     * highlight switches ~120px earlier (heading still comfortably in view).
     *
     * Conflict-free: Material's IO fires later for the SAME heading, so both
     * always agree on which item should be active.
     *
     * Uses .hash property (not href attribute) because Material resolves all
     * TOC hrefs to absolute URLs on init — attribute matching would fail.
     * ─────────────────────────────────────────────────────────────────────── */

    var ADVANCE = 120; // px earlier than Material's detection threshold

    function buildEarlyObserver() {
        var toc    = document.querySelector(".md-sidebar--secondary");
        var header = document.querySelector(".md-header");
        if (!toc || !header) return null;

        var headerH = header.getBoundingClientRect().height;
        // aboveMap: heading element → true if it has scrolled above our threshold
        var aboveMap = new Map();

        function setTocActive(hash) {
            toc.querySelectorAll("a").forEach(function (link) {
                if (hash && link.hash === hash) {
                    link.classList.add("md-nav__link--active");
                } else {
                    link.classList.remove("md-nav__link--active");
                }
            });
        }

        var headings = Array.from(
            document.querySelectorAll(".md-typeset :is(h1,h2,h3,h4,h5,h6)[id]")
        );
        if (!headings.length) return null;

        headings.forEach(function (h) { aboveMap.set(h, false); });

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                // A heading is "above" our threshold when it has left the
                // observation zone going upward (top < headerH + ADVANCE)
                var isAbove = !entry.isIntersecting &&
                              entry.boundingClientRect.top < headerH + ADVANCE;
                aboveMap.set(entry.target, isAbove);
            });

            // Last heading (in document order) that is above = active section
            var active = null;
            headings.forEach(function (h) {
                if (aboveMap.get(h)) active = h;
            });

            setTocActive(active ? "#" + active.id : "");
        }, {
            rootMargin: "-" + (headerH + ADVANCE) + "px 0px 0px 0px",
            threshold: 0
        });

        headings.forEach(function (h) { io.observe(h); });
        return io;
    }

    /* Initialise after Material has mounted its own IO, then re-init on
     * instant-navigation page changes (Material replaces the content). */
    var earlyIO = null;

    function initEarlyObserver() {
        if (earlyIO) earlyIO.disconnect();
        earlyIO = buildEarlyObserver();
    }

    // Delay slightly so Material's own IO mounts first
    setTimeout(initEarlyObserver, 200);

    // Re-init after instant navigation (Material swaps [data-md-component=content])
    var contentRoot = document.querySelector("[data-md-component=container]") ||
                      document.body;
    new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].addedNodes.length) {
                setTimeout(initEarlyObserver, 50);
                break;
            }
        }
    }).observe(contentRoot, { childList: true, subtree: false });

})();
