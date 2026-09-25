/**
 * Class / template level normalization (pure functions).
 */
(function (SAT) {
  SAT.OFFICIAL_LEVELS = [
    'IS',
    'DSA',
    'DSB',
    'DSC',
    'DSD',
    'LSA',
    'LSB',
    'LSC',
    'LSD',
    'MSA',
    'MSB',
    'ASCENT',
  ];

  const OFFICIAL_BY_LENGTH = [...SAT.OFFICIAL_LEVELS].sort((a, b) => b.length - a.length);

  function levelComparisonKey(value) {
    return String(value ?? '').replace(/[\s-]+/g, '');
  }

  SAT.normalizeLevel = function normalizeLevel(value) {
    if (value == null) return '';
    const trimmed = String(value).trim();
    if (!trimmed) return '';

    const upper = trimmed.toUpperCase();
    const compKey = levelComparisonKey(upper);

    for (const official of OFFICIAL_BY_LENGTH) {
      const officialKey = levelComparisonKey(official);
      if (compKey === officialKey) return official;
      if (compKey.startsWith(officialKey)) {
        const suffix = compKey.slice(officialKey.length);
        if (suffix && /^\d+$/.test(suffix)) return official;
      }
    }

    return upper;
  };

  SAT.levelsMatch = function levelsMatch(a, b) {
    const left = SAT.normalizeLevel(a);
    const right = SAT.normalizeLevel(b);
    if (!left || !right) return false;
    return left === right;
  };
})(window.SAT = window.SAT || {});
