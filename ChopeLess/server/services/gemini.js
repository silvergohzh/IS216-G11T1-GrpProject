// Ask Gemini to count people in a queue photo. Owner: M4
// Without GEMINI_API_KEY this returns a sample result so the UI can still be built.

export async function analyseImage(imageBase64) {
  if (!process.env.GEMINI_API_KEY || !imageBase64) {
    const people = 5 + Math.floor(Math.random() * 20)
    return { peopleInQueue: people, waitMins: Math.round(people * 0.8), seatOccupancy: 40 + Math.floor(Math.random() * 50), confidence: 'low' }
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`
  const prompt = 'Count the people queuing and estimate what percent of seats are taken. ' +
    'Reply with JSON only: {"peopleInQueue": number, "seatOccupancy": number, "confidence": "low"|"medium"|"high"}'

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  })
  if (!res.ok) throw new Error('Gemini request failed: ' + res.status)
  const data = await res.json()
  const parsed = JSON.parse(data.candidates[0].content.parts[0].text)
  // TODO (M4): tune this. About 0.8 min per person in the queue is a first guess.
  return { ...parsed, waitMins: Math.round(parsed.peopleInQueue * 0.8) }
}
