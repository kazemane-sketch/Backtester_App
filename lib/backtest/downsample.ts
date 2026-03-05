export function uniformDownsample<T>(points: T[], maxPoints: number): T[] {
  if (maxPoints <= 0) {
    return [];
  }

  if (points.length <= maxPoints) {
    return points;
  }

  if (maxPoints === 1) {
    return [points[points.length - 1]];
  }

  const out: T[] = [];
  const step = (points.length - 1) / (maxPoints - 1);

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(index * step);
    out.push(points[sourceIndex]);
  }

  return out;
}
