export const dynamic = 'force-dynamic'

import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const [{ data: portions, error: pErr }, { data: stateRows, error: sErr }] = await Promise.all([
      supabase.from('portions').select('*').order('ts', { ascending: true }),
      supabase.from('state').select('*')
    ])

    if (pErr) return Response.json({ error: pErr.message }, { status: 500 })
    if (sErr) return Response.json({ error: sErr.message }, { status: 500 })

    // Helper to get a state value safely
    const getState = (key, fallback) => {
      const row = stateRows?.find(r => r.key === key)
      return row ? row.value : fallback
    }

    return Response.json({
      e: (portions || []).map(p => [p.ts, p.p, p.mg, p.cost]),
      b:  Number(getState('boxes', 10)),
      bu: Number(getState('boxes_used', 0)),
      la: getState('last_action', null),
      cfg: getState('cfg', { mg: 10, p10: 269, ppb: 20 })
    })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { e, b, bu, la, cfg } = await request.json()

    // Delete all portions and reinsert
    const { error: delErr } = await supabase.from('portions').delete().neq('id', 0)
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 })

    if (e && e.length > 0) {
      const { error: insErr } = await supabase.from('portions').insert(
        e.map(([ts, p, mg, cost]) => ({ ts, p, mg, cost }))
      )
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 })
    }

    // Upsert all state values — explicit types to avoid jsonb mismatch
    const { error: stErr } = await supabase.from('state').upsert([
      { key: 'boxes',       value: Number(b)  },
      { key: 'boxes_used',  value: Number(bu) },
      { key: 'last_action', value: la ?? null },
      { key: 'cfg',         value: cfg        }
    ], { onConflict: 'key' })

    if (stErr) return Response.json({ error: stErr.message }, { status: 500 })

    return Response.json({ ok: true })
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}