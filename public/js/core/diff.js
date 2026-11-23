// 行级 diff（浏览器与 Node 通用）

function splitLines(text) {
  if (text == null || text === '') return [];
  const lines = String(text).split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function diffLines(a, b) {
  const A = splitLines(a);
  const B = splitLines(b);
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = A.slice(start, endA);
  const midB = B.slice(start, endB);
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ t: '=', a: i, b: i, s: A[i] });

  const n = midA.length;
  const m = midB.length;
  if (n * m > 4_000_000) {
    midA.forEach((s, i) => ops.push({ t: '-', a: start + i, s }));
    midB.forEach((s, j) => ops.push({ t: '+', b: start + j, s }));
  } else {
    // LCS 动态规划
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        ops.push({ t: '=', a: start + i, b: start + j, s: midA[i] });
        i++;
        j++;
      } else if (j < m && (i >= n || dp[i][j + 1] > dp[i + 1][j])) {
        ops.push({ t: '+', b: start + j, s: midB[j] });
        j++;
      } else {
        ops.push({ t: '-', a: start + i, s: midA[i] });
        i++;
      }
    }
  }
  for (let k = 0; k < A.length - endA; k++) ops.push({ t: '=', a: endA + k, b: endB + k, s: A[endA + k] });
  return ops;
}

export function diffStats(before, after) {
  let added = 0;
  let removed = 0;
  for (const op of diffLines(before, after)) {
    if (op.t === '+') added++;
    else if (op.t === '-') removed++;
  }
  return { added, removed };
}
