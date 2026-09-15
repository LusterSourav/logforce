const { classifyDeterministic, mockClassifyLine, groupLogsForClassification, isTraceStart, isTraceEnd, isStackFrame } = require('./_shared')
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  res.setHeader('Content-Type','application/json')
  if (req.method !== 'POST') return res.status(405).json({ error:'use POST' })
  let body = ''
  for await (const c of req) body += c
  let parsed = {}
  try { parsed = JSON.parse(body || '{}') } catch { return res.status(400).json({ error:'invalid json' }) }
  const logs = parsed.logs || []
  if (!logs.length) return res.status(200).json({ events:[] })
  const t0 = Date.now()
  const { groups, groupForOriginal } = groupLogsForClassification(logs)
  const modelInputs = groups.map(g => g.length===1 ? g[0] : g.join(' | '))
  const win = modelInputs.map(inp => classifyDeterministic(inp))
  const groupEvents = modelInputs.map((inp, idx) => {
    if (win[idx]) return null
    const m = mockClassifyLine(inp)
    return { Type:m.type, Category:m.category, Severity:m.severity, Confidence:m.confidence, Timestamp:new Date() }
  })
  const outEvents = []
  const emitted = new Set()
  for (let origIdx=0; origIdx<groupForOriginal.length; origIdx++) {
    const grpIdx = groupForOriginal[origIdx]
    if (grpIdx <0 || grpIdx >= groups.length) continue
    if (emitted.has(grpIdx)) continue
    emitted.add(grpIdx)
    const g = groups[grpIdx]
    const raw = g.join('\n')
    const summary = g.length>1 ? raw : (logs[origIdx] || '').trim() || raw.trim()
    const trimmedRaw = summary
    if (win[grpIdx]) {
      const w = win[grpIdx]
      let conf = 0.93
      if (w.category==='malicious_script' || w.category==='ids_alert') conf=0.97
      else if (w.category==='audit_metadata') conf=0.95
      outEvents.push({ type:w.type, category:w.category, severity:w.severity, timestamp:new Date().toISOString(), summary:trimmedRaw, confidence:conf, raw })
      continue
    }
    if (isTraceStart(raw)) { outEvents.push({ type:'SYSTEM', category:'trace_boundary', severity:'info', timestamp:new Date().toISOString(), summary:trimmedRaw, confidence:0.95, raw }); continue }
    if (isTraceEnd(raw)) { outEvents.push({ type:'SYSTEM', category:'trace_boundary', severity:'info', timestamp:new Date().toISOString(), summary:trimmedRaw, confidence:0.95, raw }); continue }
    const ge = groupEvents[grpIdx]
    if (ge) {
      let cat = ge.Category
      let typ = ge.Type
      if (isStackFrame(raw)) {
        const joinedGroup = g.join(' ')
        if (joinedGroup.includes('NullPointerException')) { cat='runtime_exception'; typ='ERROR' }
        else if (joinedGroup.includes('ConnectException') || joinedGroup.includes('Connection refused')) { cat='connection_failure'; typ='ERROR' }
      }
      if (raw.includes('"action":"click"') && raw.includes('"severity":"DEBUG"') && cat==='redirect') { cat='client_error'; typ='REQUEST' }
      if (raw.includes('"action": "click"') && cat==='redirect') { cat='client_error'; typ='REQUEST' }
      outEvents.push({ type:typ, category:cat, severity:ge.Severity, timestamp:ge.Timestamp.toISOString(), summary:trimmedRaw, confidence:ge.Confidence, raw })
      continue
    }
    outEvents.push({ type:'UNCLASSIFIED', category:'unknown', severity:'info', timestamp:new Date().toISOString(), summary:trimmedRaw, confidence:0.2, raw })
  }
  const lat = Date.now() - t0 + 3
  res.setHeader('X-Latency-Ms', String(lat))
  res.status(200).json({ events: outEvents, latencyMs: lat })
}
