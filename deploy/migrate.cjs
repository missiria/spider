/*
 * `deploy spider` runs `npm run db:migrate` after the build and before the pm2
 * reload. Production has no api/.env: its variables live in deploy/env/api.env,
 * parsed (with defaults) by ecosystem.config.cjs. Reuse that parsed env so
 * migrations see exactly the database the running api does.
 */
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const ecosystem = require(path.join(root, 'ecosystem.config.cjs'))
const api = ecosystem.apps.find((app) => app.name === 'spider-api')
const env = { ...process.env, ...(api ? api.env : {}) }
const command = process.argv[2] === 'show' ? 'migration:show' : 'migration:run'

const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules', 'typeorm', 'cli.js'),
    command,
    '-d',
    'dist/database/data-source.js',
  ],
  { cwd: path.join(root, 'api'), env, stdio: 'inherit' },
)
process.exit(result.status ?? 1)
