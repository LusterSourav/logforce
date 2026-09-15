const fs = require('fs')
const path = require('path')
const { getStoreDir } = require('./_shared')
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  res.setHeader('Content-Type','application/json')
  const base = getStoreDir()
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
  let files = []
  try { files = fs.readdirSync(base).filter(f=>f.endsWith('.ndjson')).map(f=>path.join(base,f)) } catch {}
  files = files.concat(walk(hiveBase))
  let total=0, last24=0, normalized=0
  const buckets = new Array(12).fill(0)
  const bucketsNorm = new Array(12).fill(0)
  const bucketsRaw = new Array(12).fill(0)
  const sources = new Set()
  const vendorCounts = {}
  const categoryCounts = {}
  const now = new Date()
  for (const fp of files) {
    let content=''
    try { content = fs.readFileSync(fp,'utf8') } catch { continue }
    let mtime = now
    try { mtime = fs.statSync(fp).mtime } catch {}
    for (const lineRaw of content.split('\n')) {
      const line = lineRaw.trim()
      if (!line) continue
      total++
      let obj={}
      try { obj = JSON.parse(line) } catch {}
      const isNorm = (obj.type && obj.type!=='' && obj.type!=='UNCLASSIFIED' && obj.category) || obj.class_uid !== undefined
      if (isNorm) normalized++
      let vendor = ''
      if (obj.metadata && obj.metadata.product && obj.metadata.product.vendor_name) vendor = obj.metadata.product.vendor_name
      else if (obj.vendor) vendor = obj.vendor
      else if (obj.type) vendor = obj.type
      if (vendor) { sources.add(vendor); vendorCounts[vendor]=(vendorCounts[vendor]||0)+1 }
      const cat = obj.category || obj.vendor || ''
      if (cat) categoryCounts[cat]=(categoryCounts[cat]||0)+1
      let t = null
      if (obj.time) t = new Date(obj.time)
      if ((!t || isNaN(t)) && obj.timestamp) t = new Date(obj.timestamp)
      if (!t || isNaN(t)) t = mtime
      if (now - t < 24*60*60*1000) {
        last24++
        const bucket = Math.floor((now - t)/(2*60*60*1000))
        if (bucket>=0 && bucket<12) {
          buckets[11-bucket]++
          if (isNorm) bucketsNorm[11-bucket]++
          else bucketsRaw[11-bucket]++
        }
      }
    }
  }
  const failed = total - normalized
  const rate = total>0 ? Math.round(normalized*100/total) : 0
  res.status(200).json({ total_events:total, normalized, failed, rate, sources:sources.size, last_24h:last24, buckets, buckets_normalized:bucketsNorm, buckets_raw:bucketsRaw, vendor_counts:vendorCounts, category_counts:categoryCounts, pg_count:-1 })
}
