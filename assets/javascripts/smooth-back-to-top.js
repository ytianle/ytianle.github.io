/* Material's navigation.top control is a button, not an anchor. Intercept it
 * before the theme handler and use an explicit animated scroll instead. */
(function () {
  'use strict';

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('button[data-md-component="top"]');
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }, true);
}());
