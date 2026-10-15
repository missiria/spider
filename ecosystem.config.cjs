const fs = require('fs')
const path = require('path')

const root = __dirname

function loadEnv(relativePath) {
  const filePath = path.join(root, relativePath)

  if (!fs.existsSync(filePath)) {
    return {}
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .flatMap((line) => {
        const trimmed = line.trim()

        if (!trimmed || trimmed.startsWith('#')) {
          return []
        }

        const separator = trimmed.indexOf('=')

        if (separator === -1) {
          return []
        }

        const key = trimmed.slice(0, separator).trim()
        let value = trimmed.slice(separator + 1).trim()

        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }

        return [[key, value]]
      }),
  )
}

const apiEnv = {
  APP_EXPOSE_PORT: '8090',
  HOST: '127.0.0.1',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  TYPEORM_MIGRATIONS_RUN: 'false',
  ...loadEnv('deploy/env/api.env'),
}

const webEnv = {
  PORT: '8091',
  HOSTNAME: '127.0.0.1',
  API_URL: 'http://127.0.0.1:8090',
  ...loadEnv('deploy/env/web.env'),
}

module.exports = {
  apps: [
    {
      name: 'spider-api',
      cwd: root,
      script: 'npm',
      args: 'run start:api',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ...apiEnv,
      },
      max_restarts: 10,
      restart_delay: 3000,
      // During pm2 reload: give the old process 15s to finish in-flight
      // requests and release the port cleanly before killing it. Shrinks
      // the window where nginx has no upstream.
      kill_timeout: 15000,
    },
    {
      name: 'spider-web',
      cwd: root,
      script: 'npm',
      args: 'run start:web',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ...webEnv,
      },
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 15000,
    },
  ],
}
