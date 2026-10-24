// Read a photo of a menu board with AI and turn it into a list of dishes. Owner: M6
// Uses the same OpenAI model and the same "structured outputs" trick as services/openai.js (M4):
// we give the AI an exact shape for its reply, so our code can always read it.
// Without OPENAI_API_KEY this returns sample dishes, so the page still works.

// The exact shape the AI must reply with
const schema = {
  type: 'object',
  properties: {
    isMenu: { type: 'boolean', description: 'true only if the photo shows a food menu or price list' },
    items: {
      type: 'array',
      description: 'Every dish or drink on the menu that has a price',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The dish name in English, as written on the menu' },
          price: { type: 'number', description: 'The price in Singapore dollars, e.g. 4.5 for $4.50' }
        },
        required: ['name', 'price'],
        additionalProperties: false
      }
    }
  },
  required: ['isMenu', 'items'],
  additionalProperties: false
}

const prompt = `You read photos of hawker stall menus in Singapore.
List every dish or drink that has a price. Use the price in dollars (4.5 means $4.50).
If one dish has several sizes, list each size as its own item, e.g. "Chicken rice (large)".
If the photo is not a menu, set isMenu to false and return an empty list.`

// Sample dishes for when there is no OpenAI key (so the rest of the feature can be built and tested)
const SAMPLE_ITEMS = [
  { name: 'Sample dish: Chicken rice', price: 450 },
  { name: 'Sample dish: Fried noodles', price: 500 },
  { name: 'Sample drink: Iced lemon tea', price: 200 }
]

// photo: a data URL ("data:image/jpeg;base64,...")
// Returns: [{ name, price }]  with price in CENTS
export async function readMenuPhoto(photo) {
  if (!process.env.OPENAI_API_KEY) return SAMPLE_ITEMS

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: photo, detail: 'high' } }
        ]
      }],
      response_format: { type: 'json_schema', json_schema: { name: 'menu', strict: true, schema } }
    })
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error('OpenAI request failed: ' + (body.error?.message || res.status))
  }
  const data = await res.json()
  const reply = JSON.parse(data.choices[0].message.content)

  if (!reply.isMenu) {
    throw Object.assign(new Error("That doesn't look like a menu. Please take a clearer photo of the menu board."), { status: 422 })
  }

  // Keep only sensible dishes, and turn dollars into cents ($4.50 -> 450)
  const items = []
  for (const item of reply.items) {
    const name = item.name.trim()
    const cents = Math.round(item.price * 100)
    if (name && cents > 0 && cents <= 10000) items.push({ name: name, price: cents })
  }
  return items.slice(0, 50) // at most 50 dishes
}
