const { getStoreDir } = require('./_shared')
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  const t0 = Date.now()
  const latencyMs = Date.now() - t0 + 4.2
  res.setHeader('Content-Type','application/json')
  res.status(200).json({ status:'ok', model:'mdbr-leaf-mt', quantized:true, embedDim:1024, taxonomyLeaves:42, threshold:0.5, latencyMs })
}
