import { addLog } from './logger'

/**
 * 将 AudioBuffer 编码为标准的 16-bit PCM WAV Blob
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16

  let result: Float32Array
  if (numChannels === 2) {
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)
    result = new Float32Array(left.length + right.length)
    for (let i = 0; i < left.length; i++) {
      result[i * 2] = left[i]
      result[i * 2 + 1] = right[i]
    }
  } else {
    result = buffer.getChannelData(0)
  }

  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const dataByteLength = result.length * bytesPerSample
  const bufferByteLength = 44 + dataByteLength

  const arrayBuffer = new ArrayBuffer(bufferByteLength)
  const view = new DataView(arrayBuffer)

  // RIFF identifier
  writeString(view, 0, 'RIFF')
  // file length minus RIFF identifier & file length header
  view.setUint32(4, 36 + dataByteLength, true)
  // RIFF type
  writeString(view, 8, 'WAVE')
  // format chunk identifier
  writeString(view, 12, 'fmt ')
  // format chunk length
  view.setUint32(16, 16, true)
  // sample format (raw)
  view.setUint16(20, format, true)
  // channel count
  view.setUint16(22, numChannels, true)
  // sample rate
  view.setUint32(24, sampleRate, true)
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * blockAlign, true)
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true)
  // bits per sample
  view.setUint16(34, bitDepth, true)
  // data chunk identifier
  writeString(view, 36, 'data')
  // data chunk length
  view.setUint32(40, dataByteLength, true)

  // Write PCM samples
  let offset = 44
  for (let i = 0; i < result.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, result[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

export async function downloadAudioUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`下载音频失败 (${response.status}): ${url}`)
  }

  const blobUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = blobUrl
  const filenameWithoutPart = filename.replace(/\.part$/i, '')
  anchor.download = filenameWithoutPart.toLowerCase().endsWith('.wav')
    ? filenameWithoutPart
    : `${filenameWithoutPart}.wav`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl)
  }, 2000)
}

async function fetchAndDecodeAudio(audioCtx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`加载音频失败 (${res.status}): ${url}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return await audioCtx.decodeAudioData(arrayBuffer)
}

/**
 * 将多个音频 URL 依次拼接，并在每段之间插入指定时长的自然静音停顿（默认 0.2 秒）
 * @param urls 待拼接的音频 URL 列表
 * @param pauseSeconds 段间停顿秒数（默认 0.2）
 * @returns 拼接后的音频 Blob URL
 */
export async function concatenateAudioUrls(
  urls: string[],
  pauseSeconds = 0.2
): Promise<string> {
  if (urls.length === 0) return ''
  if (urls.length === 1) return urls[0]

  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
  const audioCtx = new AudioCtxClass()

  addLog('info', 'AUDIO', `开始通过 Web Audio 拼接 ${urls.length} 个分段音频 (停顿: ${pauseSeconds}s)`, urls)

  try {
    const buffers = await Promise.all(urls.map(url => fetchAndDecodeAudio(audioCtx, url)))

    const sampleRate = buffers[0].sampleRate
    const numberOfChannels = Math.max(...buffers.map(b => b.numberOfChannels))

    const pauseSamples = Math.round(pauseSeconds * sampleRate)
    let totalSamples = 0
    buffers.forEach((b, idx) => {
      totalSamples += b.length
      if (idx < buffers.length - 1) {
        totalSamples += pauseSamples
      }
    })

    const mergedBuffer = audioCtx.createBuffer(numberOfChannels, totalSamples, sampleRate)

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = mergedBuffer.getChannelData(channel)
      let currentOffset = 0

      for (let i = 0; i < buffers.length; i++) {
        const b = buffers[i]
        const sourceData = b.numberOfChannels > channel
          ? b.getChannelData(channel)
          : b.getChannelData(0)

        channelData.set(sourceData, currentOffset)
        currentOffset += b.length

        if (i < buffers.length - 1) {
          currentOffset += pauseSamples
        }
      }
    }

    const wavBlob = audioBufferToWav(mergedBuffer)
    const blobUrl = URL.createObjectURL(wavBlob)
    addLog('success', 'AUDIO', `分段音频自然停顿拼接完成 (${(totalSamples / sampleRate).toFixed(2)}s)`, {
      durationSeconds: totalSamples / sampleRate,
      sampleRate,
      channels: numberOfChannels
    })
    return blobUrl
  } catch (err: any) {
    addLog('error', 'AUDIO', `音频拼接失败: ${err.message}`, urls)
    throw err
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {})
    }
  }
}
