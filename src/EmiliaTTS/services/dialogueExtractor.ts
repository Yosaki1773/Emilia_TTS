import type { DialogueItem } from '../types'
import { addLog } from './logger'

/**
 * 唯一的文本预处理与对白提取规则：
 * 提取所有以“{爱蜜莉雅}”开头的段落中角色所说的台词。
 *
 * 容错：同时支持英文花括号 { }、全角花括号 ｛｝ 以及包含空格的 { 爱蜜莉雅 } 形式。
 *
 * @param rawText 输入的完整文本内容
 * @returns 提取出的爱蜜莉雅对白列表
 */
export function extractDialogues(rawText: string): DialogueItem[] {
  if (!rawText || !rawText.trim()) {
    addLog('warn', 'EXTRACT', '提取台词跳过：输入文本为空')
    return []
  }

  // 兜底正则：兼容英文/全角/包含空格的 {爱蜜莉雅} 开头（带可选冒号）
  const LEAD_TAG_PATTERN = /^[｛{]\s*爱蜜莉雅\s*[｝}][：:]?\s*(.*)$/i

  const lines = rawText.split(/\r?\n/)
  const items: DialogueItem[] = []
  let globalIndex = 1

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    const m = trimmed.match(LEAD_TAG_PATTERN)
    if (!m) continue
    let content = (m[1] || '').trim()

    // 兜底剥去台词外层的引号或括号
    if (
      (content.startsWith('「') && content.endsWith('」')) ||
      (content.startsWith('“') && content.endsWith('”')) ||
      (content.startsWith('"') && content.endsWith('"')) ||
      (content.startsWith('『') && content.endsWith('』'))
    ) {
      content = content.substring(1, content.length - 1).trim()
    }

    if (content.length > 0) {
      items.push({
        id: `dialogue_${Date.now()}_${globalIndex}`,
        index: globalIndex++,
        speaker: '爱蜜莉雅',
        original_text: content,
        text: content,
        context: trimmed,
        matched_audio_id: null,
        speed: 0.9,
        status: 'idle'
      })
    }
  }

  // 兜底：如果完全没有匹配到 {爱蜜莉雅}，但在酒馆对话中传入了单句纯文本
  if (items.length === 0 && rawText.trim().length > 0) {
    // 检查是否有任何其他 {xxx} 标签（同样兼容全/半角）
    const generalMatch = rawText.trim().match(/^[｛{]\s*([^｝}]+?)\s*[｝}][：:]?\s*([\s\S]*)$/u)
    if (generalMatch && generalMatch[2].trim()) {
      let t = generalMatch[2].trim()
      if (
        (t.startsWith('「') && t.endsWith('」')) ||
        (t.startsWith('“') && t.endsWith('”')) ||
        (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith('『') && t.endsWith('』'))
      ) {
        t = t.substring(1, t.length - 1).trim()
      }
      items.push({
        id: `dialogue_${Date.now()}_1`,
        index: 1,
        speaker: generalMatch[1].trim(),
        original_text: t,
        text: t,
        context: rawText.trim(),
        matched_audio_id: null,
        speed: 0.9,
        status: 'idle'
      })
    }
  }

  addLog('success', 'EXTRACT', `成功提取对白共 ${items.length} 句`, {
    totalLines: lines.length,
    extractedCount: items.length,
    samples: items.slice(0, 3).map(it => it.original_text)
  })

  return items
}

/**
 * 从酒馆消息中提取指定 XML 标签内的文本（默认 <tts>...</tts>）
 *
 * 解析规则：
 * - 只有「开标签 → 闭合标签」严格配对的片段才被视为有效内容。
 * - 若某个开标签之后又出现了新的开标签（中间没有闭合），则前一个开标签作废，
 *   以最新出现的开标签为起点继续配对。
 *
 * 例：`<tts>aaaaa<tts>bbbbb</tts>` → 只返回 `bbbbb`
 *
 * @param text 待解析的完整文本
 * @param tag  标签名（默认 `tts`）
 * @returns 所有有效标签片段的内容，以换行拼接；其中除本插件标签外的其他 `<...>` 会被剥除
 */
export function extractXmlTagContent(text: string, tag = 'tts'): string {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 用一次全局扫描同时捕获开标签与闭合标签，按出现顺序遍历
  const tokenPattern = new RegExp(`<${safe}(?:\\s[^>]*)?>|</${safe}\\s*>`, 'gi')

  const contents: string[] = []
  let openIndex = -1 // 当前有效开标签的结束位置；-1 表示没有待配对的开标签

  let match: RegExpExecArray | null
  while ((match = tokenPattern.exec(text)) !== null) {
    const token = match[0]
    const isClosing = token.startsWith('</')

    if (!isClosing) {
      // 遇到新的开标签：丢弃先前未配对的开标签，改以当前开标签为起点
      openIndex = match.index + token.length
    } else if (openIndex !== -1) {
      // 遇到闭合标签且存在待配对的开标签：切出这一段内容
      contents.push(text.slice(openIndex, match.index))
      openIndex = -1
      // 没有待配对开标签时遇到的闭合标签：忽略（孤立闭合标签）
    }
  }

  return contents.join('\n').replace(/<[^>]+>/g, '').trim()
}
