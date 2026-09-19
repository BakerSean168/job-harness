export function scoreJob(job = {}, scoring = {}) {
  const title = normalize(job.title);
  const detail = normalize(job.text || job.detail);

  const titleBlockMatches = findMatches(title, scoring.titleBlockKeywords);
  const titleStrongMatches = findMatches(title, scoring.titleStrongKeywords);
  const titleMediumMatches = findMatches(title, scoring.titleMediumKeywords);
  const detailStrongMatches = findMatches(detail, scoring.detailStrongKeywords);
  const detailSupportMatches = findMatches(detail, scoring.detailSupportKeywords);
  const detailNegativeMatches = findMatches(detail, scoring.detailNegativeKeywords);
  const comboMatches = findComboMatches(`${title}\n${detail}`, scoring.comboBonuses);

  const titleScore = Math.max(
    maxScore(titleStrongMatches),
    maxScore(titleMediumMatches),
  );
  const detailScore = Math.min(sumScore(detailStrongMatches), 48);
  const supportScore = Math.min(sumScore(detailSupportMatches), 20);
  const comboScore = Math.min(sumScore(comboMatches), 20);
  const titlePenaltyScore = Math.min(sumScore(titleBlockMatches), 80);
  const penaltyScore = Math.min(sumScore(detailNegativeMatches), 45);

  let score = titleScore + detailScore + supportScore + comboScore - titlePenaltyScore - penaltyScore;
  if (titleBlockMatches.length > 0) {
    score = Math.min(score, 45);
  }
  score = clamp(Math.round(score), 0, 100);

  return {
    score,
    decision: score >= 72 ? 'strong-match' : score >= 52 ? 'review' : 'low-match',
    titleScore,
    detailScore,
    supportScore,
    comboScore,
    titlePenaltyScore,
    penaltyScore,
    matches: {
      titleStrong: titleStrongMatches,
      titleMedium: titleMediumMatches,
      detailStrong: detailStrongMatches,
      detailSupport: detailSupportMatches,
      combos: comboMatches,
      titleBlock: titleBlockMatches,
      detailNegative: detailNegativeMatches,
    },
  };
}

function findMatches(text, keywordScores = {}) {
  if (!text || !keywordScores || typeof keywordScores !== 'object') return [];
  const matches = [];
  for (const [keyword, rawScore] of Object.entries(keywordScores)) {
    if (!keyword || !containsKeyword(text, keyword)) continue;
    matches.push({ keyword, score: Number(rawScore) || 0 });
  }
  return matches.sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword));
}

function findComboMatches(text, combos = []) {
  if (!Array.isArray(combos)) return [];
  return combos
    .filter((combo) => Array.isArray(combo?.keywords) && combo.keywords.length > 1)
    .filter((combo) => combo.keywords.every((keyword) => containsKeyword(text, keyword)))
    .map((combo) => ({
      keyword: combo.keywords.join(' + '),
      score: Number(combo.score) || 0,
    }));
}

function containsKeyword(text, keyword) {
  const source = normalize(text);
  const target = normalize(keyword);
  if (!source || !target) return false;

  if (/^[a-z0-9.+#/-]{1,3}$/i.test(target)) {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(source);
  }
  if (source.includes(target)) return true;

  const looseSource = normalizeLoose(source);
  const looseTarget = normalizeLoose(target);
  return Boolean(looseSource && looseTarget && looseSource.includes(looseTarget));
}

function normalizeLoose(value) {
  return normalize(value)
    .replace(/[\s·•_—–-]+/g, '')
    .replace(/[（）()【】\[\]]/g, '');
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function maxScore(matches) {
  return matches.reduce((max, item) => Math.max(max, item.score || 0), 0);
}

function sumScore(matches) {
  return matches.reduce((sum, item) => sum + (item.score || 0), 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
