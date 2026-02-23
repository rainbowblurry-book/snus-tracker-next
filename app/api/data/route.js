import { supabase } from '@/lib/supabase'

export async function GET() {
  const [{ data: portions }, { data: state }] = await Promise.all([
    supabase.from('portions').select('*').order('ts', { ascending: true }),
    supabase.from('state').select('*')
  ])

  const cfg = state?.find(r => r.key === 'cfg')?.value || { mg: 10, p10: 269, ppb: 20 }
  const boxes = state?.find(r => r.key === 'boxes')?.value || 10
  const boxes_used = state?.find(r => r.key === 'boxes_used')?.value || 0
  const last_action = state?.find(r => r.key === 'last_action')?.value || null

  return Response.json({
    e: portions?.map(p => [p.ts, p.p, p.mg, p.cost]) || [],
    b: boxes, bu: boxes_used, la: last_action, cfg
  })
}

export async function POST(request) {
  const body = await request.json()
  const { e, b, bu, la, cfg } = body

  await Promise.all([
    supabase.from('portions').delete().neq('id', 0),
    supabase.from('state').upsert([
      { key: 'boxes', value: b },
      { key: 'boxes_used', value: bu },
      { key: 'last_action', value: la },
      { key: 'cfg', value: cfg }
    ])
  ])

  if (e?.length) {
    await supabase.from('portions').insert(
      e.map(([ts, p, mg, cost]) => ({ ts, p, mg, cost }))
    )
  }

  return Response.json({ ok: true })
}