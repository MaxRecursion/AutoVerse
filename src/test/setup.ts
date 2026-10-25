import '@testing-library/jest-dom/vitest'

// jsdom lacks matchMedia / ResizeObserver, which UI primitives rely on.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
if (!('ResizeObserver' in window)) {
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom does not implement scrolling; pages that bring a target into view only need it not to throw.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
