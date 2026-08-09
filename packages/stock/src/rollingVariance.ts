const ROLLING_CANCELLATION_RATIO = 1_000_000;

/** Detect scale-independent loss of significance after removing a rolling sample. */
export function shouldRebaseRollingVariance(nextM2: number, removedContribution: number): boolean {
  if (!Number.isFinite(nextM2) || nextM2 < 0) return true;
  const removedMagnitude = Math.abs(removedContribution);
  const residualMagnitude = Math.abs(nextM2);
  return (
    removedMagnitude > 0 &&
    (residualMagnitude === 0 || removedMagnitude / residualMagnitude > ROLLING_CANCELLATION_RATIO)
  );
}
