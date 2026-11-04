// The rules for a Hidden Gem: how its ID is made and how the form data is checked.
// Pure functions with no database, so they can be unit tested. Owner: M5

export const DIETARY = ['halal', 'vegetarian']
export const SERVICE_MODES = ['dine-in', 'takeaway']
export const IMAGE_PREFIX = 'data:image/jpeg;base64,'
export const MAX_IMAGE_CHARS = 400000   // keeps each photo well under Firestore's 1 MB document limit

// Makes an error with an HTTP status code. The shared handler in index.js sends it to the browser.
export const httpError = (status, msg) => Object.assign(new Error(msg), { status })

// Turns a name into a readable document ID: "Ba Buông Bánh Mì" -> "ba-buong-banh-mi"
export const slugify = s => String(s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents
  .replace(/đ/gi, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40)

// The photo arrives as a small JPEG data URL made by the browser
function parseImage(imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith(IMAGE_PREFIX)) {
    throw httpError(400, 'Add a photo of the place')
  }
  if (imageUrl.length > MAX_IMAGE_CHARS) throw httpError(400, 'That photo is too big. Pick a smaller one.')
  if (!/^[A-Za-z0-9+/=]+$/.test(imageUrl.slice(IMAGE_PREFIX.length))) throw httpError(400, 'That photo is not valid')
  return imageUrl
}

// Check and clean the data the form sends. Used by both submit and edit.
// A gem must have everything a place needs, so it can join the voting pool.
export function parseGem(body) {
  const { name, mustTry, cuisine, address, lat, lng, priceMin, priceMax, dietary, serviceModes, waitMins, imageUrl } = body

  if (!name?.trim()) throw httpError(400, 'Name is required')
  if (!cuisine?.trim()) throw httpError(400, 'Cuisine is required')
  if (!address?.trim()) throw httpError(400, 'Address is required')

  const min = Number(priceMin)
  const max = Number(priceMax)
  if (priceMin === '' || priceMax === '' || priceMin == null || priceMax == null ||
      !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    throw httpError(400, 'Enter a valid price range (min is 0 or more, max is not below min)')
  }

  const wait = Number(waitMins)
  if (waitMins === '' || waitMins == null || !Number.isFinite(wait) || wait < 0 || wait > 180) {
    throw httpError(400, 'Enter the typical wait in minutes (0 to 180)')
  }

  const modes = Array.isArray(serviceModes) ? serviceModes.filter(m => SERVICE_MODES.includes(m)) : []
  if (!modes.length) throw httpError(400, 'Pick dine-in, takeaway or both')

  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (lat == null || lat === '' || lng == null || lng === '' ||
      !Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
      Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
    throw httpError(400, 'Pick the location on the map (valid latitude and longitude required)')
  }

  return {
    name: name.trim(),
    mustTry: mustTry?.trim() || '',
    cuisine: cuisine.trim(),
    address: address.trim(),
    lat: latNum,
    lng: lngNum,
    priceMin: min,
    priceMax: max,
    dietary: Array.isArray(dietary) ? dietary.filter(d => DIETARY.includes(d)) : [],
    serviceModes: modes,
    waitMins: wait,
    imageUrl: parseImage(imageUrl)
  }
}