// Ask OpenAI how busy an eatery is from one photo. Owner: M4
// Without OPENAI_API_KEY this returns a sample result so the UI can still be built.

// The model must reply in exactly this shape (OpenAI "structured outputs").
// "observations" comes first so the model looks at the photo before it gives numbers,
// which makes the counts more accurate.
const schema = {
  type: 'object',
  properties: {
    observations: { type: 'string', description: 'One or two sentences on what the photo shows: queues at stalls, people seated, empty tables' },
    peopleInQueue: { type: 'integer', description: 'People standing in line at food stalls' },
    seatOccupancy: { type: 'integer', description: 'Percent of visible seats or tables in use, 0-100' },
    waitMins: { type: 'integer', description: 'Estimated minutes to reach the front of a typical queue' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] }
  },
  required: ['observations', 'peopleInQueue', 'seatOccupancy', 'waitMins', 'confidence'],
  additionalProperties: false
}

const prompt = `You estimate how busy a food place in Singapore (hawker centre, food court or restaurant) is from one photo.
1. Look at the whole photo, including the background. People seated at tables count towards seat occupancy even if nobody is queuing.
2. peopleInQueue: count people standing in line at stalls or counters. Give your best estimate; do not return 0 unless you clearly see no queue.
3. seatOccupancy: estimate what percent of the visible seats or tables are in use.
4. waitMins: about 1 minute per person in the queue, plus a few minutes if seats look hard to find.
5. confidence: "high" if queues and seating are clearly visible, "medium" if partly visible or far away, "low" if blurry, dark, or it is not a food place.`

export async function analyseImage(imageBase64, mimeType = 'image/jpeg') {
  if (!process.env.OPENAI_API_KEY || !imageBase64) {
    const people = 5 + Math.floor(Math.random() * 20)
    return { peopleInQueue: people, waitMins: Math.round(people * 0.8), seatOccupancy: 40 + Math.floor(Math.random() * 50), confidence: 'low' }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } }
        ]
      }],
      response_format: { type: 'json_schema', json_schema: { name: 'queue_estimate', strict: true, schema } }
    })
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error('OpenAI request failed: ' + (body.error?.message || res.status))
  }
  const data = await res.json()
  const r = JSON.parse(data.choices[0].message.content)
  console.log('[OpenAI]', r) // handy for checking why an estimate looks off

  // Keep numbers in a sensible range in case the model guesses wildly
  const clamp = (n, max) => Math.max(0, Math.min(max, Math.round(n)))
  return {
    peopleInQueue: clamp(r.peopleInQueue, 200),
    seatOccupancy: clamp(r.seatOccupancy, 100),
    waitMins: clamp(r.waitMins, 120),
    confidence: r.confidence
  }
}
