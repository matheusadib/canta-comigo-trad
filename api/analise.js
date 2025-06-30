
import { GoogleGenAI } from '@google/genai';

const getJsonFromResponse = (text) => {
  let jsonStr = text.trim();
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }
  try {
    const parsedData = JSON.parse(jsonStr);
    if (parsedData && (parsedData.error || (parsedData.title && parsedData.artist && Array.isArray(parsedData.lyrics)))) {
      return parsedData;
    }
    return null;
  } catch (err) {
    console.error("Backend failed to parse JSON response:", err);
    // Fallback to find a JSON object within the string
    const jsonMatch = jsonStr.match(/{[\s\S]*}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        console.error("Backend failed to parse extracted JSON either:", e2);
        return null;
      }
    }
    return null;
  }
};

export default async function handler(req, res) {
  // Apenas aceita requisições POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Pega a chave da API das variáveis de ambiente do servidor (seguro)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da API não configurada no servidor.' });
  }

  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Nenhuma busca fornecida.' });
    }
    
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      You are a linguistic analysis expert API. Your task is to process a song request and return a structured JSON object.
      Do not include any explanatory text before or after the JSON object. The response must be only the JSON.
      The user has requested the song: "${query}". Please identify the song title and artist from this query.
      Your task is to:
      1. Find the original lyrics for this song.
      2. Identify the original language of the lyrics (e.g., "English", "Spanish", "Japanese").
      3. For each line of the original lyrics, provide a line-by-line translation into Brazilian Portuguese.
      4. For each line of the original lyrics, provide a simplified, Brazilian Portuguese-friendly phonetic transcription. This should use common Brazilian Portuguese letters and sounds to approximate the pronunciation, NOT the International Phonetic Alphabet (IPA). For example, "I love you" should become "ái lâv iú".
      The final output MUST be a single JSON object with the following structure:
      {
        "title": "The Song Title",
        "artist": "The Artist Name",
        "language": "The Original Language Name",
        "lyrics": [
          {
            "original": "First line of original lyrics",
            "translation": "Primeira linha da tradução em português",
            "phonetics": "fers-t lain of oridjinaul lirics"
          }
        ]
      }
      Ensure that each object in the 'lyrics' array corresponds to a single line and that the 'original', 'translation', and 'phonetics' fields are perfectly aligned. If the song cannot be found, return a JSON object with an error message: { "error": "Música não encontrada." }.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      }
    });

    const parsedData = getJsonFromResponse(response.text);

    if (parsedData) {
      res.status(200).json(parsedData);
    } else {
      throw new Error("A resposta da API não continha um JSON válido ou estava mal formatada.");
    }
  } catch (error) {
    console.error('Error in serverless function:', error);
    res.status(500).json({ error: error.message || 'Ocorreu um erro no servidor.' });
  }
}
