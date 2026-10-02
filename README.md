# Smart Green Campus – Wild Plant Monitoring

A web application that helps university maintenance staff identify plants using the **Pl@ntNet API** and provides actionable management recommendations using the **Groq API (Llama 3.1)**.

## Architecture

1. **User Uploads Photo:** A plant image is uploaded from the frontend.
2. **Context Provided:** The user selects the campus location, whether it was intentionally planted, and whether it obstructs facilities.
3. **Pl@ntNet Identification (`/api/identify`):** The server sends the image to Pl@ntNet API to get plant identification (scientific name, common names, confidence score).
4. **Groq AI Analysis (`/api/analyze`):** The plant identification data and context are sent to a Groq AI model (Llama 3.1) configured with JSON Schema to return a structured maintenance recommendation.
5. **Dashboard & History:** Results are saved locally in the browser and displayed in a dashboard.

## Decision Categories

- **TANAMAN DIPERLIHARA:** Plants intentionally planted in managed areas.
- **PANTAU:** Naturally occurring plants that are not currently causing issues.
- **TINDAK LANJUT:** Plants growing where they shouldn't (e.g., blocking drains or pathways).
- **VERIFIKASI:** Pl@ntNet confidence is low, or AI cannot make a safe recommendation.

## Fallback Behavior

If the AI service (Groq) is unavailable or identification confidence is less than 50%:
- `< 50% confidence` ➔ VERIFIKASI
- `Intentionally planted` ➔ TANAMAN DIPERLIHARA
- `Not intentional + Obstructs facility` ➔ TINDAK LANJUT
- `Otherwise` ➔ PANTAU

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Make sure you have the environment variables set up in `.env`:
   ```env
   GROQ_API_KEY=gsk_...
   PLANT_NET_API_KEY=2b...
   ```

## Environment Variables

- `GROQ_API_KEY`: API Key for Groq.
- `PLANT_NET_API_KEY`: API Key for Pl@ntNet.

Never expose these keys to the client. The application proxies requests through server-side Next.js API routes (`/api/...`).

## How to Run

```bash
npm run dev
```
Then visit `http://localhost:3000`.

## Testing

To thoroughly test the application:
1. Upload a clear picture of a common plant (e.g., grass or weed). Test "Pantau" (not obstructing) and "Tindak Lanjut" (obstructing).
2. Upload a picture of a decorative plant. Mark as "Taman" and "Sengaja Ditanam" to test "Tanaman Dipelihara".
3. Upload an invalid/unclear image to test low-confidence behavior (`Verifikasi`).
4. (Simulate offline AI): Change `GROQ_API_KEY` to an invalid key to test the Fallback Behavior.
