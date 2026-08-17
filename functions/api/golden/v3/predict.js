/*
 * POST /api/golden/v3/predict
 * Locks the current Golden V3 prediction.
 */
import { onRequestGet as dashboardGet } from "./dashboard.js";

function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,headers:{
      "content-type":"application/json; charset=UTF-8",
      "cache-control":"no-store"
    }
  });
}
function todayVN() {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(now);
}

export async function onRequestPost(context) {
  try {
    const db=context.env.DB;
    if(!db) throw new Error("Không tìm thấy DB binding");

    const dashReq = new Request(new URL("/api/golden/v3/dashboard",context.request.url));
    const d = await dashboardGet({...context,request:dashReq});
    const data=await d.json();
    if(!data.success) return json(data,d.status);

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

    const predictionDate=data.predictionDate;
    const existed=await db.prepare(`
      SELECT prediction_date FROM golden_v3_predictions WHERE prediction_date=?
    `).bind(predictionDate).first();

    if(existed) return json({success:true,version:"golden-v3.0.0",existed:true,predictionDate});

    const now=new Date().toISOString();
    await db.prepare(`
      INSERT INTO golden_v3_predictions
      (prediction_date,source_date,pairs_json,head_top_json,tail_top_json,
       model_version,created_at)
      VALUES(?,?,?,?,?,?,?)
    `).bind(
      predictionDate,
      data.sourceLatestDate,
      JSON.stringify(data.recommendation?.pairs || []),
      JSON.stringify(data.topHead || []),
      JSON.stringify(data.topTail || []),
      "golden-v3.0.0",
      now
    ).run();

    return json({
      success:true,
      version:"golden-v3.0.0",
      existed:false,
      predictionDate,
      sourceDate:data.sourceLatestDate,
      pairs:data.recommendation?.pairs || []
    });
  } catch(e) {
    return json({success:false,message:e.message},500);
  }
}
