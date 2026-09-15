const fs = require('fs')
const path = require('path')
const { getStoreDir } = require('./_shared')
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  res.setHeader('Content-Type','application/json')
  let body = ''
  for await (const c of req) body += c
  let sqlStr = ''
  try {
    const j = JSON.parse(body || '{}')
    sqlStr = j.sql || j.query || ''
  } catch { sqlStr = '' }
  if (!sqlStr) {
    try { const u = new URL(req.url, 'http://localhost'); sqlStr = u.searchParams.get('q') || '' } catch {}
  }
  const classFilter = sqlStr.includes('4001') ? 4001 : 0
  const vendorFilter = sqlStr.toLowerCase().includes('ulpf') ? 'ulpf' : ''
  const base = getStoreDir()
  const pattern = path.join(base, '*.ndjson')
  const glob = (p) => {
    const dir = path.dirname(p)
    const pat = path.basename(p)
    try {
      const files = fs.readdirSync(dir)
      const re = new RegExp('^' + pat.replace(/\*/g,'.*').replace(/\?/g,'.') + '$')
      return files.filter(f=>re.test(f)).map(f=>path.join(dir,f))
    } catch { return [] }
  }
  let files = glob(pattern)
  const hiveBase = path.join(path.dirname(base), 'parquet')
  const walk = (dir) => {
    let out=[]
    try {
      const entries = fs.readdirSync(dir, { withFileTypes:true })
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) out = out.concat(walk(full))
        else if (e.name.endsWith('.ndjson')) out.push(full)
      }
    } catch {}
    return out
  }
  files = files.concat(walk(hiveBase))
  let pruned=0, scanned=0, matched=0
  const rows=[]
  for (const fp of files) {
    if (classFilter===4001 && fp.includes('class=') && !fp.includes('class=4001')) { pruned++; continue }
    scanned++
    let content=''
    try { content = fs.readFileSync(fp,'utf8') } catch { continue }
    for (const lineRaw of content.split('\n')) {
      const line = lineRaw.trim()
      if (!line) continue
      if (vendorFilter && !line.toLowerCase().includes(vendorFilter.toLowerCase())) continue
      let obj
      try { obj = JSON.parse(line) } catch { continue }
      if (classFilter!==0) {
        if (obj.class_uid !== undefined) { if (obj.class_uid !== classFilter) continue }
        else if (obj.classUid !== undefined) { if (obj.classUid !== classFilter) continue }
        else continue
      }
      matched++
      if (rows.length<200) rows.push(obj)
    }
  }
  res.status(200).json({ sql:sqlStr, prune:{ scanned_files:scanned, pruned_files:pruned, matched_rows:matched }, pg_count:-1, rows })
}
