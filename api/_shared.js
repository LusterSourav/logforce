const fs = require('fs')
const path = require('path')

function getStoreDir() {
  const candidates = ['/tmp/output/normalized', path.join(process.cwd(), 'output/normalized'), path.join(process.cwd(), 'ULPF-Perimeter-Prototype/output/normalized')]
  for (const c of candidates) {
    try { fs.mkdirSync(c, { recursive: true }); return c } catch {}
  }
  const d = '/tmp/output/normalized'
  fs.mkdirSync(d, { recursive: true })
  return d
}

function isWindowsSecuritySignal(s) {
  for (const k of ['Microsoft-Windows-PowerShell','Microsoft-Windows-Security-Auditing','Sysmon','EventID','LogName:','ScriptBlock','Creating Scriptblock','ScriptBlockId','MessageNumber','PowerShell']) {
    if (s.includes(k)) return true
  }
  return false
}

function classifyWindowsGroup(joined) {
  const j = joined
  const lower = joined.toLowerCase()
  if (!isWindowsSecuritySignal(j)) return null
  for (const k of ['invoke-mimikatz','invoke-shellcode','invoke-expression','frombase64string','mimikatz','sekurlsa','kerberos::','-encodedcommand','-enc ','downloadstring','net.webclient','invoke-obfuscation']) {
    if (lower.includes(k.toLowerCase())) return { type:'SECURITY', category:'malicious_script', severity:'critical' }
  }
  if (j.includes('4104') || j.includes('ScriptBlock') || j.includes('Creating Scriptblock')) {
    let sev = 'info'
    if (lower.includes('level: warning') || (lower.includes('warning') && j.includes('4104'))) sev = 'warning'
    return { type:'SECURITY', category:'script_execution', severity:sev }
  }
  if (j.includes('4103') || j.includes('Pipeline Execution') || j.includes('Module Logging')) return { type:'SECURITY', category:'script_execution', severity:'info' }
  if (j.includes('4688') || lower.includes('new process') || lower.includes('process creation')) return { type:'SECURITY', category:'process_creation', severity:'info' }
  if (j.includes('4624') || j.includes('4625') || lower.includes('logon')) return { type:'SECURITY', category:'authentication', severity:'info' }
  if (j.includes('LogName:') || j.includes('EventID:') || j.trim().startsWith('Level:') || j.trim().startsWith('Description:')) return { type:'SECURITY', category:'audit_metadata', severity:'info' }
  return { type:'SECURITY', category:'audit_event', severity:'info' }
}

function isNetworkVendorSignal(s) {
  const lower = s.toLowerCase()
  for (const k of ['paloalto','pan-os','fortigate','suricata','snort','traffic,','threat,','"event_type":"alert"','et exploit','et malware','et c2']) {
    if (lower.includes(k)) return true
  }
  for (const k of ['%ASA-','CEF:','TRAFFIC,','THREAT,','"event_type": "alert"']) {
    if (s.includes(k)) return true
  }
  return false
}

function classifyNetworkGroup(joined) {
  if (!isNetworkVendorSignal(joined)) return null
  const lower = joined.toLowerCase()
  if (joined.includes('"event_type":"alert"') || joined.includes('"event_type": "alert"') || (lower.includes('suricata') && lower.includes('signature')) || (lower.includes('snort') && lower.includes('signature'))) {
    let sev = 'high'
    const targeted = lower.includes('exploit') || lower.includes('c2') || lower.includes('trojan') || lower.includes('malware')
    if (targeted || joined.includes('"severity":1') || joined.includes('"severity": 1')) sev = 'critical'
    if (lower.includes('et info') && !targeted && sev === 'critical') sev = 'high'
    return { type:'SECURITY', category:'ids_alert', severity:sev }
  }
  if (joined.includes('%ASA-')) {
    let sev = 'info'
    const idx = joined.indexOf('%ASA-')
    if (idx >= 0 && idx + 5 < joined.length) {
      const ch = joined[idx+5]
      if (ch === '1' || ch === '2') sev = 'critical'
      else if (ch === '3') sev = 'error'
      else if (ch === '4') sev = 'warning'
    }
    if (lower.includes('deny') || lower.includes('denied') || joined.includes('106023') || joined.includes('106100') || joined.includes('106015') || joined.includes('106021')) {
      if (sev === 'info') sev = 'warning'
      return { type:'NETWORK', category:'firewall_deny', severity:sev }
    }
    return { type:'NETWORK', category:'firewall_session', severity:sev }
  }
  if (joined.includes('CEF:')) {
    let act = ''
    const li = lower.indexOf('act=')
    if (li >= 0) {
      let rest = lower.slice(li+4)
      const j = rest.search(/[ |]/)
      act = j >= 0 ? rest.slice(0,j) : rest
    }
    if (['deny','drop','block','quarantine','reset'].includes(act)) return { type:'SECURITY', category:'policy_deny', severity:'warning' }
    return { type:'NETWORK', category:'traffic_flow', severity:'info' }
  }
  if (joined.includes('THREAT,') || lower.includes('threat,')) {
    let sev = 'warning'
    if (lower.includes('critical')) sev = 'critical'
    else if (lower.includes('high')) sev = 'error'
    else if (lower.includes('medium')) sev = 'warning'
    else if (lower.includes('low')) sev = 'info'
    return { type:'SECURITY', category:'threat_event', severity:sev }
  }
  if (joined.includes('TRAFFIC,') || lower.includes('traffic,') || lower.includes('paloalto') || lower.includes('pan-os')) return { type:'NETWORK', category:'traffic_flow', severity:'info' }
  if (lower.includes('fortigate')) {
    if (lower.includes('action=deny') || lower.includes('action=drop') || lower.includes('action=block')) return { type:'NETWORK', category:'firewall_deny', severity:'warning' }
    return { type:'NETWORK', category:'traffic_flow', severity:'info' }
  }
  return { type:'NETWORK', category:'traffic_flow', severity:'info' }
}

function classifyCrashGroup(joined) {
  if (joined.toLowerCase().includes('fatal exception')) return { type:'ERROR', category:'runtime_exception', severity:'error' }
  return null
}

function classifyDeterministic(joined) {
  return classifyCrashGroup(joined) || classifyNetworkGroup(joined) || classifyWindowsGroup(joined) || null
}

function mockClassifyLine(line) {
  const det = classifyDeterministic(line)
  if (det) return { ...det, confidence: det.category === 'malicious_script' || det.category === 'ids_alert' ? 0.97 : det.category === 'audit_metadata' ? 0.95 : 0.93 }
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('exception') || lower.includes('failed')) return { type:'ERROR', category:'runtime_exception', severity:'error', confidence:0.82 }
  if (lower.includes('warn')) return { type:'SYSTEM', category:'warning', severity:'warning', confidence:0.71 }
  if (lower.includes('traffic') || lower.includes('allow') || lower.includes('accept')) return { type:'NETWORK', category:'traffic_flow', severity:'info', confidence:0.68 }
  if (lower.includes('deny') || lower.includes('block') || lower.includes('drop')) return { type:'NETWORK', category:'firewall_deny', severity:'warning', confidence:0.75 }
  if (lower.includes('auth') || lower.includes('login') || lower.includes('logon')) return { type:'SECURITY', category:'authentication', severity:'info', confidence:0.66 }
  return { type:'REQUEST', category:'success', severity:'info', confidence:0.55 }
}

function groupLogsForClassification(logs) {
  const groups = []
  const groupForOriginal = []
  let i = 0
  while (i < logs.length) {
    const line = logs[i]
    const trimmed = line.trim()
    if (trimmed.includes('STACK TRACE START') || trimmed.includes('TRACE START') || trimmed === '--- END TRACE ---' || trimmed.includes('END TRACE')) {
      groups.push([line]); groupForOriginal.push(groups.length-1); i++; continue
    }
    const lowerLine = line.toLowerCase()
    if (lowerLine.includes('exception:')) {
      const group = [line]
      let j = i+1
      while (j < logs.length && j < i+30 && !isNewEventAnchor(logs[j]) && isCrashContinuation(logs[j])) { group.push(logs[j]); j++ }
      groups.push(group)
      for (let k=i;k<j;k++) groupForOriginal.push(k===i?groups.length-1:-1)
      i=j; continue
    }
    if (isStackFrame(line)) {
      if (groups.length>0 && groups[groups.length-1][0] && groups[groups.length-1][0].toLowerCase().includes('exception:')) {
        groups[groups.length-1].push(line); groupForOriginal.push(-1); i++; continue
      }
      groups.push([line]); groupForOriginal.push(groups.length-1); i++; continue
    }
    if (isNestedCause(line)) {
      const group=[line]
      if (i+1<logs.length && isStackFrame(logs[i+1])) { group.push(logs[i+1]); groups.push(group); groupForOriginal.push(groups.length-1); groupForOriginal.push(-1); i+=2; continue }
      groups.push(group); groupForOriginal.push(groups.length-1); i++; continue
    }
    if (trimmed.includes('"action":"click"') || trimmed.includes('"action": "click"')) { groups.push([line]); groupForOriginal.push(groups.length-1); i++; continue }
    if (isWindowsEventStart(line) || (isWindowsEventKV(line) && isWindowsSecuritySignal(line))) {
      const group=[line]; let j=i+1
      while (j<logs.length && j<i+20) {
        const nxt=logs[j]
        if (nxt.includes('STACK TRACE START') || nxt.includes('TRACE START') || nxt.includes('Exception:')) break
        if (nxt.includes('LogName:')) break
        if (isWindowsEventKV(nxt) || isWindowsSecuritySignal(nxt) || nxt.trim()==='' || nxt.includes('Write-Host') || nxt.includes('Scriptblock')) {
          if (nxt.trim()!=='') group.push(nxt); j++; continue
        }
        break
      }
      groups.push(group)
      for (let k=i;k<j;k++) groupForOriginal.push(k===i?groups.length-1:-1)
      i=j; continue
    }
    groups.push([line]); groupForOriginal.push(groups.length-1); i++
  }
  if (groupForOriginal.length !== logs.length) {
    const ng=[]; const nm=[]
    for (const l of logs) ng.push([l])
    for (let idx=0; idx<logs.length; idx++) nm.push(idx)
    return { groups: ng, groupForOriginal: nm }
  }
  return { groups, groupForOriginal }
}

function isTraceStart(line){ const t=line.trim(); return t.includes('STACK TRACE START') || t.includes('TRACE START') }
function isTraceEnd(line){ const t=line.trim(); return t==='--- END TRACE ---' || t.includes('END TRACE') }
function isStackFrame(line){ const trimmed=line.trimStart(); return trimmed.startsWith('at ') || trimmed.startsWith('at.') || line.startsWith('    at ') || line.startsWith('\tat ') }
function isNestedCause(line){ const t=line.trim(); return t.includes('NESTED TRACE') || t.includes('caused by:') || t.includes('Caused by:') }
function isWindowsEventKV(line){ const idx=line.indexOf(':'); if(idx<1||idx>50) return false; const key=line.slice(0,idx).trim(); if(key===''||(key.includes(' ')&&key.length>30)) return false; return line.slice(idx+1).trim().length>0 }
function isWindowsEventStart(line){ return line.includes('LogName:') || line.includes('EventID:') || line.includes('Microsoft-Windows-PowerShell') || line.includes('Microsoft-Windows-Security-Auditing') || line.includes('ScriptBlock') || line.includes('Creating Scriptblock') }
function isCrashContinuation(line){
  const t=line.trim()
  if(isStackFrame(line)||isNestedCause(line)) return true
  if(t.startsWith('Process:')||t.includes('PID:')) return true
  if(line.toLowerCase().includes('exception:')) return true
  if(t.startsWith('...')&&t.includes('more')) return true
  return false
}
function isNewEventAnchor(line){
  const t=line.trim()
  if(t.length>=6 && t[0]>='0'&&t[0]<='9' && t[1]>='0'&&t[1]<='9' && t[2]==='-' && t[3]>='0'&&t[3]<='9' && t[4]>='0'&&t[4]<='9') return true
  for(const p of ['<','%ASA-','CEF:','{','LogName:','EventID:']) if(t.startsWith(p)) return true
  return false
}

module.exports = { getStoreDir, classifyDeterministic, mockClassifyLine, groupLogsForClassification, isTraceStart, isTraceEnd, isStackFrame }
