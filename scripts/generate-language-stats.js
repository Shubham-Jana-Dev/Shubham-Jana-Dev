const fs = require('fs');
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GH_USERNAME;

async function run() {
  try {
    const { data: repos } = await octokit.rest.repos.listForUser({ username: owner, per_page: 100 });
    const totals = {};

    for (const r of repos) {
      if (r.fork) continue; // Skip forked repos
      const { data: langs } = await octokit.rest.repos.getLanguages({ owner, repo: r.name });
      for (const [lang, bytes] of Object.entries(langs)) {
        totals[lang] = (totals[lang] || 0) + bytes;
      }
    }

    const sorted = Object.entries(totals)
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 6); // Top 6 languages

    const sum = sorted.reduce((a, b) => a + b.bytes, 0);
    const svg = generateSVG(sorted, sum);
    fs.writeFileSync('language-stats.svg', svg);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

function generateSVG(data, total) {
  const width = 400;
  const rowHeight = 40;
  const height = data.length * rowHeight + 20;
  
  const rows = data.map((item, i) => {
    const pct = ((item.bytes / total) * 100).toFixed(1);
    const barWidth = (item.bytes / total) * 250;
    return `
      <text x="10" y="${35 + i * rowHeight}" fill="#9fef00" font-family="Segoe UI, sans-serif" font-size="14">${item.name}</text>
      <rect x="110" y="${25 + i * rowHeight}" width="250" height="10" rx="5" fill="#1e293b" />
      <rect x="110" y="${25 + i * rowHeight}" width="${barWidth}" height="10" rx="5" fill="#9fef00" />
      <text x="365" y="${35 + i * rowHeight}" fill="#94a3b8" font-family="Segoe UI, sans-serif" font-size="12">${pct}%</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#0d1117" rx="10" />
    ${rows}
  </svg>`;
}

run();
