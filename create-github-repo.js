/* Secure GitHub repo creator — token comes from GITHUB_TOKEN env only.
 * The previous version of this file contained a hardcoded personal access
 * token. That token must be revoked immediately at:
 * https://github.com/settings/tokens
 * Usage: $env:GITHUB_TOKEN='ghp_...' ; node create-github-repo.js
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const https = require('https');

const token = process.env.GITHUB_TOKEN;
const repoName = process.env.GITHUB_REPO || 'cho-appointment-system';

if (!token) {
  console.error('Missing env: set GITHUB_TOKEN. Refusing to continue without it.');
  process.exit(1);
}

const data = JSON.stringify({
  name: repoName,
  description: 'CHO Laboratory Appointment Booking & Admin System - Next.js, Supabase, Tailwind CSS',
  private: false,
  auto_init: false,
});

const options = {
  hostname: 'api.github.com',
  port: 443,
  path: '/user/repos',
  method: 'POST',
  headers: {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'CHO-Appointment-System-Deployer',
    Accept: 'application/vnd.github.v3+json',
  },
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    if (res.statusCode === 201) {
      console.log('Repository created successfully!');
      console.log(JSON.parse(body).html_url);
    } else {
      console.error('Failed to create repository:', res.statusCode);
      console.error(body);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();
