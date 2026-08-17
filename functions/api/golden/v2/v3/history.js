/*
 * GET /api/golden/v3/history
 */
function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}
  });
}
export async function onRequestGet(context){
  try{
    const db=context.env.DB;
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS golden_v3_predictions (
        prediction_date TEXT PRIMARY KEY,
        source_date TEXT NOT NULL,
        pairs_json TEXT NOT NULL,
        head_top_json TEXT NOT NULL,
        tail_top_json TEXT NOT NULL,
        model_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        evaluated_at TEXT,
        actual_special TEXT,
        evaluation_json TEXT
      )
    `).run();
    const url=new URL(context.request.url);
    const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||30)));
    const q=await db.prepare(`
      SELECT * FROM golden_v3_predictions
      ORDER BY prediction_date DESC LIMIT ?
    `).bind(limit).all();
    const history=(q.results||[]).map(r=>({
      ...r,
      pairs:JSON.parse(r.pairs_json||"[]"),
      headTop:JSON.parse(r.head_top_json||"[]"),
      tailTop:JSON.parse(r.tail_top_json||"[]"),
      evaluation:JSON.parse(r.evaluation_json||"null")
    }));
    return json({success:true,version:"golden-v3.0.0",history});
  }catch(e){return json({success:false,message:e.message},500);}
}
