export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB
      .prepare("SELECT COUNT(*) AS total FROM results")
      .all();

    return Response.json({
      success: true,
      database: "connected",
      totalResults: results[0].total
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        database: "error",
        message: error.message
      },
      {
        status: 500
      }
    );
  }
}