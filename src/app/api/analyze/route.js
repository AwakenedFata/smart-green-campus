import { NextResponse } from "next/server";
import Groq from "groq-sdk";

export async function POST(request) {
  try {
    const body = await request.json();
    const { plant_identification, campus_context } = body;

    if (!plant_identification || !campus_context) {
      return NextResponse.json(
        { error: "plant_identification and campus_context are required" },
        { status: 400 }
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json(
        { error: "Groq API Key is missing" },
        { status: 500 }
      );
    }

    const groq = new Groq({ apiKey: groqApiKey });

    const systemPrompt = `You are a plant-management assessment assistant for a university campus. Your job is NOT to blindly decide that a plant is a weed. You receive:
1. Plant identification results from Pl@ntNet.
2. Campus location/context.
3. Whether the plant appears intentionally planted.
4. Whether it interferes with facilities or access.

Your task is to produce a practical management recommendation for campus maintenance staff.

Important rules:
- Treat Pl@ntNet identification as evidence, not absolute truth.
- Consider scientific name, common names, genus, family, confidence score, and alternative candidates.
- Do not invent botanical facts.
- Do not claim a plant is poisonous, invasive, harmful, medicinal, edible, or dangerous unless the information is sufficiently supported by the provided context.
- If identification confidence is low, prefer VERIFIKASI.
- A plant being naturally occurring does NOT automatically mean it must be removed.
- A plant being a weed in some contexts does NOT automatically mean it must be removed from every campus area.
- Consider the location and maintenance context.
- Plants intentionally planted in managed garden areas should normally be categorized as TANAMAN_DIPERLIHARA unless there is strong evidence of a maintenance issue.
- Plants growing naturally in inappropriate locations such as walkways, drains, building access paths, or infrastructure areas can receive a TINDAK_LANJUT recommendation when supported by context.
- When evidence is insufficient, choose PANTAU or VERIFIKASI instead of making an aggressive recommendation.
- Recommendations are for campus maintenance assistance and must remain reviewable by a human staff member.
- Do not perform dangerous chemical recommendations.
- Prefer mechanical/manual maintenance suggestions where appropriate.
- All final output must be in Indonesian.
- VERY IMPORTANT: Write the summary, reasoning_summary, and recommended_actions in plain, everyday language (bahasa awam) that is easily understood by garden staff or general users. 
- DO NOT use technical developer jargon, decimal scores (like 0.55571), or mention technical terms like "Pl@ntNet", "API", or "confidence score". Instead, use phrases like "Tingkat kecocokan identifikasi", "sangat mirip", "kurang meyakinkan", dsb.
`;

    const userMessage = JSON.stringify({
      plant_identification,
      campus_context
    });

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      model: "openai/gpt-oss-20b",
      temperature: 0.1,
      response_format: { 
        type: "json_schema", 
        json_schema: { 
          name: "plant_management_assessment", 
          strict: true, 
          schema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["TANAMAN_DIPERLIHARA", "PANTAU", "TINDAK_LANJUT", "VERIFIKASI"]
              },
              priority: {
                type: "string",
                enum: ["RENDAH", "SEDANG", "TINGGI"]
              },
              plant_role: {
                type: "string"
              },
              recommendation_confidence: {
                type: "number",
                minimum: 0,
                maximum: 100
              },
              summary: {
                type: "string"
              },
              reasoning_summary: {
                type: "array",
                items: { type: "string" }
              },
              recommended_actions: {
                type: "array",
                items: { type: "string" }
              },
              follow_up_days: {
                type: "number",
                minimum: 0,
                maximum: 365
              },
              verification_needed: {
                type: "boolean"
              },
              warning: {
                type: "string",
                description: "Always show: Rekomendasi merupakan bantuan untuk petugas dan perlu verifikasi kondisi lapangan."
              }
            },
            required: [
              "status",
              "priority",
              "plant_role",
              "recommendation_confidence",
              "summary",
              "reasoning_summary",
              "recommended_actions",
              "follow_up_days",
              "verification_needed",
              "warning"
            ],
            additionalProperties: false
          }
        } 
      },
    });

    let rawResponse = completion.choices[0]?.message?.content;
    if (!rawResponse) {
      throw new Error("Empty response from Groq");
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(rawResponse);
    } catch (e) {
      console.error("Failed to parse Groq response:", rawResponse);
      throw new Error("Invalid JSON from Groq");
    }

    return NextResponse.json(parsedResult);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan server saat melakukan analisis lanjutan." },
      { status: 500 }
    );
  }
}
