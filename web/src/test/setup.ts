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
