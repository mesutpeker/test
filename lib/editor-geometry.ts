export type CropRect = { x: number; y: number; w: number; h: number };
export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export function transformCrop(
  rect: CropRect,
  dx: number,
  dy: number,
  handle: CropHandle,
  width: number,
  height: number,
): CropRect {
  if (handle === 'move')
    return {
      ...rect,
      x: clamp(rect.x + dx, 0, width - rect.w),
      y: clamp(rect.y + dy, 0, height - rect.h),
    };
  let { x, y } = rect;
  let right = rect.x + rect.w,
    bottom = rect.y + rect.h;
  if (handle.includes('w')) x = clamp(x + dx, 0, right - 5);
  if (handle.includes('e')) right = clamp(right + dx, x + 5, width);
  if (handle.includes('n')) y = clamp(y + dy, 0, bottom - 5);
  if (handle.includes('s')) bottom = clamp(bottom + dy, y + 5, height);
  return { x, y, w: right - x, h: bottom - y };
}

export function imageRotation(width: number, height: number, rotation: number) {
  const angle = ((rotation % 360) + 360) % 360;
  return {
    width: angle === 90 || angle === 270 ? height : width,
    height: angle === 90 || angle === 270 ? width : height,
    x: angle === 90 ? height : angle === 180 ? width : 0,
    y: angle === 180 ? height : angle === 270 ? width : 0,
    radians: (angle * Math.PI) / 180,
    angle,
  };
}
