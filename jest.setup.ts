import '@testing-library/jest-dom'

// jsdom does not expose TextEncoder/TextDecoder; polyfill from Node.js
import { TextEncoder, TextDecoder } from 'util'
Object.assign(globalThis, { TextEncoder, TextDecoder })
