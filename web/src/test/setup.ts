import '@testing-library/jest-dom/vitest';

// jsdom 没有 ResizeObserver：Radix 的 Checkbox / Slider 等用它量尺寸，测试里给个什么都不做的替身
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}

// jsdom 没有 scrollIntoView；cmdk 选中项变化时会调（milestone 切换器等下拉）
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
