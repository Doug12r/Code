import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sizeParam = searchParams.get('size')
  
  // Parse size parameter (default to 10KB)
  let sizeInBytes = 10 * 1024 // 10KB default
  
  if (sizeParam) {
    const match = sizeParam.match(/^(\d+)(kb|mb|b)?$/i)
    if (match) {
      const [, number, unit] = match
      const numValue = parseInt(number, 10)
      
      switch (unit?.toLowerCase()) {
        case 'mb':
          sizeInBytes = numValue * 1024 * 1024
          break
        case 'kb':
          sizeInBytes = numValue * 1024
          break
        case 'b':
        default:
          sizeInBytes = unit === 'b' ? numValue : numValue * 1024 // Default to KB if no unit
          break
      }
    }
  }

  // Cap the size to prevent abuse (max 10MB)
  sizeInBytes = Math.min(sizeInBytes, 10 * 1024 * 1024)
  
  // Generate test data
  const testData = Buffer.alloc(sizeInBytes, 0)
  
  // Fill with some pattern for realistic compression behavior
  for (let i = 0; i < sizeInBytes; i++) {
    testData[i] = i % 256
  }

  return new NextResponse(testData, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': sizeInBytes.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Bandwidth-Test-Size': sizeInBytes.toString(),
      'X-Bandwidth-Test-Timestamp': Date.now().toString()
    }
  })
}