import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!image) {
      return NextResponse.json(
        { error: "Image is required" },
        { status: 400 }
      );
    }

    const plantNetApiKey = process.env.PLANT_NET_API_KEY;
    if (!plantNetApiKey) {
      return NextResponse.json(
        { error: "PlantNet API Key is missing" },
        { status: 500 }
      );
    }

    const organ = formData.get("organ") || "auto";

    // Prepare form data for Pl@ntNet
    const plantNetFormData = new FormData();
    plantNetFormData.append("images", image);
    plantNetFormData.append("organs", organ);

    const plantNetUrl = `https://my-api.plantnet.org/v2/identify/all?api-key=${plantNetApiKey}`;

    const response = await fetch(plantNetUrl, {
      method: "POST",
      body: plantNetFormData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("PlantNet error:", errorData);
      
      // Specifically handle not found
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Tanaman tidak terdeteksi dalam foto." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: "Gagal mengidentifikasi tanaman dari PlantNet." },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Normalize PlantNet Response
    const normalizedData = normalizePlantNetResult(data);

    return NextResponse.json(normalizedData);
  } catch (error) {
    console.error("Identification error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan server saat identifikasi." },
      { status: 500 }
    );
  }
}

function normalizePlantNetResult(data) {
  if (!data || !data.results || data.results.length === 0) {
    throw new Error("No results found");
  }

  const bestResult = data.results[0];
  
  const topResults = data.results.slice(0, 5).map((res) => ({
    scientificName: res.species?.scientificNameWithoutAuthor || res.species?.scientificName || "Unknown",
    commonNames: res.species?.commonNames || [],
    score: res.score,
    genus: res.species?.genus?.scientificNameWithoutAuthor || "",
    family: res.species?.family?.scientificNameWithoutAuthor || "",
  }));

  return {
    bestMatch: bestResult.species?.scientificNameWithoutAuthor || "Unknown",
    scientificName: bestResult.species?.scientificNameWithoutAuthor || "Unknown",
    commonNames: bestResult.species?.commonNames || [],
    genus: bestResult.species?.genus?.scientificNameWithoutAuthor || "",
    family: bestResult.species?.family?.scientificNameWithoutAuthor || "",
    confidence: bestResult.score || 0,
    topResults,
    plantNetVersion: data.version || null,
  };
}
