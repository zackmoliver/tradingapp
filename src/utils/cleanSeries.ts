export function cleanSeries<X = number | string>(xs: X[], ys: Array<number | string | null | undefined>) {
  const outX: X[] = [];
  const outY: number[] = [];
  for (let i = 0; i < ys.length; i++) {
    const y = Number(ys[i]);
    if (Number.isFinite(y)) {
      outX.push(xs[i]);
      outY.push(y);
    }
  }
  return { x: outX, y: outY };
}
