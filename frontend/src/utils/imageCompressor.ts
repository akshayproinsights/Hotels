/**
 * Utility for compressing and optimizing images on the client side before upload.
 * Especially tailored for mobile PWA usage to reduce file size while maintaining
 * visually identical quality and razor-sharp text legibility for printing ID documents.
 */

interface CompressOptions {
  maxDimension?: number // Maximum width or height in pixels (default: 2048)
  quality?: number      // JPEG quality between 0 and 1 (default: 0.86)
  maxSizeBytes?: number // If file size is below this, compression might be skipped (default: 250KB)
}

export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxDimension = 2048,
    quality = 0.86,
    maxSizeBytes = 250 * 1024, // 250 KB
  } = options

  // Only compress image files (skip PDFs, SVGs, etc.)
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return file
  }

  // If SVG or already under maxSizeBytes and not a giant camera image, return original
  if (file.type === 'image/svg+xml') {
    return file
  }

  // If file is already small (e.g. < 250KB), check if compression is needed
  if (file.size <= maxSizeBytes) {
    return file
  }

  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img

      // Check if resizing is necessary
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) {
        resolve(file)
        return
      }

      // Fill white background in case source had transparency (e.g. PNG converted to JPEG)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      // Export to high-quality JPEG
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }

          // If compressed blob is somehow larger than original, stick with original
          if (blob.size >= file.size) {
            resolve(file)
            return
          }

          // Create new compressed File object preserving original filename with .jpg extension if needed
          let newName = file.name
          if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(newName)) {
            newName = `${newName}.jpg`
          } else {
            newName = newName.replace(/\.(png|webp|heic|heif)$/i, '.jpg')
          }

          const compressedFile = new File([blob], newName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })

          resolve(compressedFile)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = (err) => {
      console.error('Failed to load image for compression, using original file:', err)
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }

    img.src = objectUrl
  })
}

/**
 * Utility to compress an array of files in parallel or sequence.
 */
export async function compressImages(
  files: File[],
  options?: CompressOptions
): Promise<File[]> {
  return Promise.all(files.map((file) => compressImage(file, options)))
}
