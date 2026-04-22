export const normalizeOcrDate = (value) => {
  if (!value) {
    return "";
  }
  const text = String(value).trim();
  if (!text) {
    return "";
  }
  const match = text.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
  if (match) {
    const year = match[1];
    const month = String(match[2]).padStart(2, "0");
    const day = String(match[3]).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return text;
};

export const extractOcrFields = (text) => {
  const normalized = String(text || "").replace(/\r/g, "\n");
  const rawLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lines = rawLines.map((line) => line.replace(/\s+/g, " "));
  const compactLines = rawLines.map((line) => line.replace(/\s+/g, ""));
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const holderHardNoiseRegex =
    /(证书编号|证号|编号|日期|发证日期|颁发日期|签发日期|机构|单位|issuer|organization)/i;
  const holderSoftNoiseRegex = /(课程|培训|完成|通过|等级|项目|成绩)/i;
  const certNoiseRegex =
    /(证书编号|证号|编号|姓名|持有人|持证人|颁发日期|发证日期|签发日期|机构|issuer|organization|awarded\s+to|granted\s+to|presented\s+to)/i;
  const certKeywordRegex =
    /(证书|奖状|奖项|奖学金|荣誉|称号|资格|认证|证明|聘书|结业|培训|获奖|优秀|先进|一等奖|二等奖|三等奖)/i;
  const certGenericOnlyRegex = /^(荣誉证书|证书|certificate)$/i;
  const holderLabelRegex = /^(证书持有人|证书持有人姓名|持有人|持证人|获奖人|姓名|holder|name)$/i;
  const valueBoundaryRegex =
    /(证书编号|证书号|证号|编号|颁发日期|发证日期|签发日期|日期|颁发机构|发证单位|颁发单位|机构|issuedby|issuer|organization)/i;
  const trimByBoundary = (value) => {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    const match = text.match(valueBoundaryRegex);
    if (!match || typeof match.index !== "number" || match.index <= 0) {
      return text;
    }
    return text.slice(0, match.index).trim();
  };
  const normalizeHolderValue = (value) =>
    trimByBoundary(
      String(value || "")
        .replace(/^(证书持有人|证书持有人姓名|持有人|持证人|获奖人|姓名|holder|name)\s*[:：]?\s*/i, "")
        .replace(/^[：:;；,\s]+/, "")
        .trim()
    );
  const cleanInlineValue = (value) =>
    trimByBoundary(
      String(value || "")
      .replace(/^[：:;；,\s]+/, "")
      .replace(/\s+$/, "")
      .trim()
    );
  const extractInlineValueFromCompact = (compact, compactLabel) => {
    const index = compact.indexOf(compactLabel);
    if (index === -1) {
      return "";
    }
    const after = cleanInlineValue(compact.slice(index + compactLabel.length));
    if (!after) {
      return "";
    }
    return after;
  };
  const readNextValue = (index) => {
    for (let i = index + 1; i < rawLines.length; i += 1) {
      if (rawLines[i].trim()) {
        return rawLines[i].trim();
      }
    }
    return "";
  };
  const findByLabels = (labels) => {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const compact = compactLines[i];
      for (const label of labels) {
        const regex = new RegExp(`${escapeRegExp(label)}\\s*[:：]?\\s*(.+)$`, "i");
        const match = line.match(regex);
        if (match && match[1]) {
          return match[1].trim();
        }
        const compactLabel = label.replace(/\s+/g, "");
        if (compact === compactLabel) {
          const nextValue = readNextValue(i);
          if (nextValue) {
            return nextValue;
          }
        }
        if (!compact.includes(compactLabel)) {
          continue;
        }
        const inlineValue = extractInlineValueFromCompact(compact, compactLabel);
        if (inlineValue) {
          return inlineValue;
        }
        const nextValue = readNextValue(i);
        if (nextValue) {
          return nextValue;
        }
      }
    }
    return "";
  };
  const collectByLabels = (labels) => {
    const values = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const compact = compactLines[i];
      for (const label of labels) {
        const regex = new RegExp(`^\\s*${escapeRegExp(label)}\\s*[:：]\\s*(.+)$`, "i");
        const match = line.match(regex);
        if (match && match[1]) {
          values.push(match[1].trim());
          continue;
        }
        const compactLabel = label.replace(/\s+/g, "");
        if (compact === compactLabel) {
          const nextValue = readNextValue(i);
          if (nextValue) {
            values.push(nextValue);
          }
          continue;
        }
        if (!compact.includes(compactLabel)) {
          continue;
        }
        const inlineValue = extractInlineValueFromCompact(compact, compactLabel);
        if (inlineValue) {
          values.push(inlineValue);
        }
      }
    }
    return values;
  };
  const findByRegexList = (regexList) => {
    for (const regex of regexList) {
      const match = normalized.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return "";
  };
  const isLikelyHolderName = (value) => {
    const cleaned = normalizeHolderValue(value)
      .replace(/[=:_\-]+/g, "")
      .replace(/[;；，,]/g, "")
      .replace(/\s*(同学|先生|女士)$/, "")
      .trim();
    if (!cleaned) {
      return false;
    }
    if (holderHardNoiseRegex.test(cleaned)) {
      return false;
    }
    if (holderLabelRegex.test(cleaned)) {
      return false;
    }
    if (/\d/.test(cleaned)) {
      return false;
    }
    if (/^[=._-]+$/.test(cleaned)) {
      return false;
    }
    const zhCount = (cleaned.match(/[\u4e00-\u9fa5·]/g) || []).length;
    const enCount = (cleaned.match(/[A-Za-z]/g) || []).length;
    if (zhCount >= 2 && zhCount <= 12) {
      return true;
    }
    if (enCount >= 3 && cleaned.length <= 40) {
      return true;
    }
    return false;
  };
  const cleanNameValue = (value) => {
    const text = normalizeHolderValue(value)
      .replace(/[=:_\-]+/g, "")
      .replace(/[;；，,]/g, "")
      .replace(/\s*(同学|先生|女士)$/, "")
      .trim();
    if (!text) {
      return "";
    }
    const zhMatch = text.match(/[\u4e00-\u9fa5·]{2,12}/);
    if (zhMatch && zhMatch[0] && !holderHardNoiseRegex.test(zhMatch[0])) {
      return zhMatch[0];
    }
    const enMatch = text.match(/[A-Za-z][A-Za-z\s]{1,30}/);
    if (enMatch && enMatch[0]) {
      return enMatch[0].trim();
    }
    return text;
  };
  const isLikelyCertificateName = (value) => {
    const cleaned = String(value || "").replace(/\s+/g, "").replace(/[=:_\-]/g, "").trim();
    if (!cleaned) {
      return false;
    }
    if (cleaned.length < 2 || cleaned.length > 40) {
      return false;
    }
    if (certNoiseRegex.test(cleaned)) {
      return false;
    }
    if (/^\d+$/.test(cleaned)) {
      return false;
    }
    if (certGenericOnlyRegex.test(cleaned)) {
      return false;
    }
    if (certKeywordRegex.test(cleaned)) {
      return true;
    }
    const zhCount = (cleaned.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (zhCount >= 2 && zhCount <= 18) {
      return true;
    }
    return /[A-Za-z]/.test(cleaned) && cleaned.length >= 4;
  };
  const cleanCertificateNameValue = (value) =>
    String(value || "")
      .replace(/^(证书名称|证书名|证书类别|证书类型|荣誉称号|证书项目|certificate name)\s*[:：]?\s*/i, "")
      .trim();
  const scoreTitleLine = (line) => {
    const cleaned = String(line || "").replace(/\s+/g, "").trim();
    if (!cleaned) {
      return -100;
    }
    if (certNoiseRegex.test(cleaned)) {
      return -10;
    }
    let score = 0;
    if (cleaned.includes("证书")) {
      score += 4;
    }
    if (certKeywordRegex.test(cleaned)) {
      score += 3;
    }
    if (cleaned.length >= 4 && cleaned.length <= 24) {
      score += 2;
    } else if (cleaned.length > 30) {
      score -= 2;
    }
    if (certGenericOnlyRegex.test(cleaned)) {
      score -= 3;
    }
    return score;
  };
  const getBestHolderCandidate = (initialValue) => {
    const candidates = [];
    if (initialValue) {
      candidates.push(initialValue);
    }
    candidates.push(
      ...collectByLabels(["证书持有人", "证书持有人姓名", "持有人", "持证人", "获奖人", "姓名", "holder"])
    );
    const sentenceRegexList = [
      /(?:兹证明|特授予|授予|颁发给|颁授|授予给|获奖人|持证人|证书持有人)[：:\s]*([\u4e00-\u9fa5·]{2,12})(?=[\s,，。]|$)/g,
      /(?:证书持有人|证书持有人姓名|持有人|持证人|获奖人|姓名)\s*[:：]\s*([^\n]{1,40})/g,
      /(?:awarded\s+to|presented\s+to|granted\s+to|certifies\s+that)\s*[:,-]?\s*([A-Za-z][A-Za-z.\-'\s]{1,48})/gi
    ];
    for (const regex of sentenceRegexList) {
      const matches = normalized.matchAll(regex);
      for (const match of matches) {
        if (match?.[1]) {
          candidates.push(match[1].trim());
        }
      }
    }
    const compactText = normalized.replace(/\s+/g, "");
    const compactHolderMatch = compactText.match(
      /(?:证书持有人|证书持有人姓名|持有人|持证人|获奖人|姓名)[:：]?([\u4e00-\u9fa5·]{2,12}?)(?=证书编号|证书号|证号|编号|颁发日期|发证日期|签发日期|日期|$)/
    );
    if (compactHolderMatch && compactHolderMatch[1]) {
      candidates.push(compactHolderMatch[1]);
    }
    const scored = candidates
      .map((item) => cleanNameValue(item))
      .filter(Boolean)
      .map((item) => {
        let score = 0;
        if (isLikelyHolderName(item)) {
          score += 6;
        }
        if (/^[\u4e00-\u9fa5·]{2,6}$/.test(item)) {
          score += 3;
        }
        if (holderSoftNoiseRegex.test(item)) {
          score -= 2;
        }
        return { item, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].item : "";
  };
  const getTitleBeforeKeywords = () => {
    const stopIndex = rawLines.findIndex((line) =>
      /(证书持有人|持证人|持有人|证书编号|证号|编号|颁发日期|发证日期|签发日期|日期)/.test(line)
    );
    const titleLines = (stopIndex === -1 ? rawLines : rawLines.slice(0, stopIndex > 0 ? stopIndex : 6))
      .map((line) => line.replace(/\s+/g, ""))
      .filter((line) => line.length > 1)
      .filter((line) => !certNoiseRegex.test(line));
    if (!titleLines.length) {
      return "";
    }
    const mergedCandidates = [];
    for (let i = 0; i < titleLines.length; i += 1) {
      mergedCandidates.push(titleLines[i]);
      if (i + 1 < titleLines.length) {
        mergedCandidates.push(`${titleLines[i]}${titleLines[i + 1]}`);
      }
      if (i + 2 < titleLines.length) {
        mergedCandidates.push(`${titleLines[i]}${titleLines[i + 1]}${titleLines[i + 2]}`);
      }
    }
    const sorted = mergedCandidates
      .map((line) => ({ line, score: scoreTitleLine(line) }))
      .sort((a, b) => b.score - a.score);
    return sorted[0]?.score > 0 ? sorted[0].line : "";
  };
  const getBestTitleLine = () => {
    const candidates = rawLines.filter((line) => {
      if (certNoiseRegex.test(line)) {
        return false;
      }
      const cleaned = line.replace(/\s+/g, "");
      return cleaned.length >= 3 && cleaned.length <= 30;
    });
    if (!candidates.length) {
      return "";
    }
    const sorted = candidates
      .map((line, index) => ({
        line: line.trim(),
        score: scoreTitleLine(line) + (index < 5 ? 1 : 0)
      }))
      .sort((a, b) => b.score - a.score);
    return sorted[0]?.score > 0 ? sorted[0].line : "";
  };
  const getBestCertificateCandidate = (initialValue) => {
    const candidates = [];
    if (initialValue) {
      candidates.push(initialValue);
    }
    candidates.push(
      ...collectByLabels(["证书名称", "证书名", "证书类别", "证书类型", "荣誉称号", "证书项目", "certificate name"])
    );
    const topTitle = getTitleBeforeKeywords();
    if (topTitle) {
      candidates.push(topTitle);
    }
    const bestLine = getBestTitleLine();
    if (bestLine) {
      candidates.push(bestLine);
    }
    const scored = candidates
      .map((item) => cleanCertificateNameValue(item))
      .filter(Boolean)
      .map((item) => {
        let score = scoreTitleLine(item);
        if (isLikelyCertificateName(item)) {
          score += 5;
        }
        return { item, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].item : "";
  };

  let certificateName = cleanCertificateNameValue(
    findByLabels([
    "证书名称",
    "证书名",
    "证书类别",
    "证书类型",
    "荣誉称号",
    "证书项目",
    "certificate name"
    ])
  );
  let holderName = findByLabels([
    "证书持有人",
    "证书持有人姓名",
    "持有人",
    "持证人",
    "获奖人",
    "姓名",
    "holder"
  ]);
  const certificateNo = findByRegexList([
    /(?:证书编号|证书号|证号|编号)[:：\s]*([A-Za-z0-9\-_]+)/i,
    /(?:certificate\s*no|certificate\s*number|no\.)[:：\s]*([A-Za-z0-9\-_]+)/i
  ]);
  let organization = findByLabels(["颁发机构", "发证单位", "颁发单位", "机构", "organization", "issuer", "issued by"]);
  const issueDateRaw =
    findByRegexList([
      /(?:颁发日期|发证日期|签发日期|日期)[:：\s]*([0-9年月日\-/.]+)/i,
      /(?:issue\s*date|date)[:：\s]*([0-9\-/.]+)/i
    ]) ||
    (normalized.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/) || [])[0] ||
    "";
  const issueDate = normalizeOcrDate(issueDateRaw);

  holderName = getBestHolderCandidate(holderName);

  certificateName = getBestCertificateCandidate(certificateName);

  if (!organization) {
    const orgSuffix = /(学院|大学|中心|研究院|委员会|协会|公司|有限公司|集团|部门|局|部|医院|学校)$/;
    const lastOrg = rawLines.slice().reverse().find((line) => orgSuffix.test(line));
    if (lastOrg) {
      organization = lastOrg.trim();
    }
  }

  return {
    certificateName,
    holderName,
    certificateNo,
    organization,
    issueDate
  };
};
