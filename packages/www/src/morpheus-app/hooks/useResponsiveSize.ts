import { useEffect, useRef, useState, type RefObject } from 'react';

const ORIGINAL_HEIGHT = 400;
const ORIGINAL_WIDTH = 640;
const ORIGINAL_ASPECT_RATIO = ORIGINAL_WIDTH / ORIGINAL_HEIGHT;

export interface ResponsiveSize {
  width: number;
  height: number;
  left: number;
  top: number;
}

function calculateSize(
  containerWidth: number,
  containerHeight: number,
): ResponsiveSize {
  let horizontalPadding = 0;
  let verticalPadding = 0;
  let width = containerWidth;
  let height = containerHeight;

  if (width / height > ORIGINAL_ASPECT_RATIO) {
    const widthOffset = width - height * ORIGINAL_ASPECT_RATIO;
    width -= widthOffset;
    horizontalPadding = widthOffset / 2;
  } else {
    const heightOffset = height - width / ORIGINAL_ASPECT_RATIO;
    height -= heightOffset;
    verticalPadding = heightOffset / 2;
  }

  return {
    width: Math.floor(width),
    height: Math.floor(height),
    left: Math.floor(horizontalPadding),
    top: Math.floor(verticalPadding),
  };
}

function getViewportSize(): { width: number; height: number } {
  if (typeof document === 'undefined') {
    return { width: 800, height: 600 };
  }
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
}

function getAvailableSize(containerRef?: RefObject<HTMLElement | null>): {
  width: number;
  height: number;
} {
  const container = containerRef?.current;
  if (container && container.clientWidth > 0 && container.clientHeight > 0) {
    return {
      width: container.clientWidth,
      height: container.clientHeight,
    };
  }
  return getViewportSize();
}

export default function useResponsiveSize(
  containerRef?: RefObject<HTMLElement | null>,
): ResponsiveSize {
  const lastSize = useRef<{ width: number; height: number } | null>(null);

  const [size, setSize] = useState<ResponsiveSize>(() => {
    const available = getAvailableSize(containerRef);
    return calculateSize(available.width, available.height);
  });

  useEffect(() => {
    const updateSize = () => {
      const available = getAvailableSize(containerRef);

      if (
        lastSize.current &&
        lastSize.current.width === available.width &&
        lastSize.current.height === available.height
      ) {
        return;
      }

      lastSize.current = available;
      setSize(calculateSize(available.width, available.height));
    };

    updateSize();

    const container = containerRef?.current;
    let resizeObserver: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(container);
    }
    window.addEventListener('resize', updateSize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [containerRef]);

  return size;
}
