#!/usr/bin/env node
/**
 * Bravura ERP — Database Migration Runner
 *
 * Applies any unapplied SQL files from /supabase/*.sql in filename order.
 * Tracks applied migrations in a _schema_migrations table.
 *
 * Required env var: DATABASE_URL (PostgreSQL connection string)
 */

const { Client } = require('pg')
const fs   = require('fs')
const path = require('path')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL environment variable is not set.')
  process.exit(1)
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase')

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    console.log('✅  Connected to database.')

    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // Get already-applied migrations
    const { rows } = await client.query('SELECT filename FROM _schema_migrations ORDER BY filename')
    const applied = new Set(rows.map(r => r.filename))

    // Read and sort all .sql files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort()

    const pending = files.filter(f => !applied.has(f))

    if (pending.length === 0) {
      console.log('✅  No pending migrations — database is up to date.')
      return
    }

    console.log(`📋  ${pending.length} migration(s) to apply: ${pending.join(', ')}\n`)

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file)
      const sql = fs.readFileSync(filePath, 'utf8')

      console.log(`⏳  Applying: ${file}`)
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query(
          'INSERT INTO _schema_migrations (filename) VALUES ($1)',
          [file]
        )
        await client.query('COMMIT')
        console.log(`✅  Applied:  ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`\n❌  FAILED:   ${file}`)
        console.error(`    Error:   ${err.message}`)
        console.error(`    Detail:  ${err.detail || '—'}`)
        process.exit(1)
      }
    }

    console.log('\n🎉  All migrations applied successfully.')

  } finally {
    await client.end()
  }
}

run().catch(err => {
  console.error('Unexpected error:', err.message)
  process.exit(1)
})
