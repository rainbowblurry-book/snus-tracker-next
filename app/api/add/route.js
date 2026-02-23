import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data: stateData } = await supabase.from('state').select('*')
  const cfg = stateData?.find(r => r.key === 'cfg')?.value || { mg: 10, p10: 269, ppb: 20 }
  
  const cpp = cfg.p10 / (cfg.ppb * 10)
  const ts = Date.now()
  
  await supabase.from('portions').insert({ ts, p: 1, mg: cfg.mg, cost: cpp })
  await supabase.from('state').upsert({ key: 'last_action', value: 1 })

  const today = new Date().toISOString().slice(0, 10)
  const { data: todayPortions } = await supabase
    .from('portions')
    .select('p')
    .gte('ts', new Date(today).getTime())

  const todayCount = todayPortions?.reduce((s, r) => s + r.p, 0) || 1

  return Response.json({ ok: true, today: todayCount })
}