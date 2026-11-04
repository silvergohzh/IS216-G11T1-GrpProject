// Unit test: the Hidden Gems rules (naming and validating a gem). No database needed. Owner: M5

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify, parseGem } from '../services/gemRules.js'

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='

const validGem = () => ({
  name: '  Ba Buông Bánh Mì ',
  mustTry: 'Bánh mì',
  cuisine: 'Vietnamese',
  address: '90 Middle Rd',
  lat: '1.2966',
  lng: 103.8506,
  priceMin: 5,
  priceMax: 10,
  dietary: ['halal', 'made-up-tag'],
  serviceModes: ['dine-in', 'delivery'],
  waitMins: '10',
  imageUrl: PHOTO
})

// parseGem must refuse the data with a 400 and a message that matches
const refuses = (changes, message) =>
  assert.throws(
    () => parseGem({ ...validGem(), ...changes }),
    err => err.status === 400 && message.test(err.message)
  )

test('slugify turns a restaurant name into a readable document id', () => {
  assert.equal(slugify('Ba Buông Bánh Mì'), 'ba-buong-banh-mi')
  assert.equal(slugify('Đồng Khởi Café'), 'dong-khoi-cafe')
  assert.equal(slugify('   !!!   '), '')
  assert.equal(slugify('a'.repeat(100)).length, 40)
})

test('parseGem cleans valid data: trims text, turns strings into numbers, drops unknown tags', () => {
  assert.deepEqual(parseGem(validGem()), {
    name: 'Ba Buông Bánh Mì',
    mustTry: 'Bánh mì',
    cuisine: 'Vietnamese',
    address: '90 Middle Rd',
    lat: 1.2966,
    lng: 103.8506,
    priceMin: 5,
    priceMax: 10,
    dietary: ['halal'],
    serviceModes: ['dine-in'],
    waitMins: 10,
    imageUrl: PHOTO
  })
})

test('parseGem refuses a gem that could not join the voting pool', () => {
  refuses({ imageUrl: '' }, /photo/i)
  refuses({ lat: null, lng: null }, /location/i)
  refuses({ priceMin: 10, priceMax: 5 }, /price/i)
  refuses({ serviceModes: [] }, /dine-in/i)
  refuses({ waitMins: 500 }, /wait/i)
})