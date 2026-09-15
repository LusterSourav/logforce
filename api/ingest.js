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
  const url = new URL(req.url, 'http://localhost')
  const qFmt = url.searchParams.get('format') || 'generic'
  try{
    const r = await fetch('https://logforce.onrender.com/api/ingest?format='+encodeURIComponent(qFmt), {method:'POST', headers:{'Content-Type':'application/x-ndjson'}, body: body})
    const j = await r.json()
    const base = getStoreDir()
    const dateStr = new Date().toISOString().slice(0,10)
    const outPath = path.join(base, 'perimeter-' + dateStr + '.ndjson')
    fs.mkdirSync(path.dirname(outPath), {recursive:true})
    if(body.trim()) try{ fs.appendFileSync(outPath, body.trim()+'\n') }catch(e){}
    return res.status(200).json(j)
  }catch(e){}
  const base = getStoreDir()
  const dateStr = new Date().toISOString().slice(0,10)
  const outPath = path.join(base, 'perimeter-' + dateStr + '.ndjson')
  const hiveBase = path.join(path.dirname(base), 'parquet')
  const now = new Date()
  const hive = path.join(path.dirname(base), 'parquet/year='+now.getFullYear()+'/month='+String(now.getMonth()+1).padStart(2,'0')+'/day='+String(now.getDate()).padStart(2,'0')+'/class=4001/vendor='+qFmt)
  fs.mkdirSync(path.dirname(outPath), {recursive:true})
  fs.mkdirSync(hive, {recursive:true})
  let count = 0
  const lines = body.split('\n')
  let toAppend = ''
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    count++
    toAppend += line + '\n'
  }
  if (toAppend) {
    fs.appendFileSync(outPath, toAppend)
    const hiveFile = path.join(hive, 'perimeter-' + dateStr + '.ndjson')
    fs.appendFileSync(hiveFile, toAppend)
  }
  res.status(200).json({ ingested:count, pg_inserted:0, file:outPath })
}
