import type { DialogueItem } from '../types'
import { addLog } from './logger'

/**
 * 唯一的文本预处理与对白提取规则：
 * 提取所有以“{爱蜜莉雅}”开头的段落中角色所说的台词。
 *
 * @param rawText 输入的完整文本内容
 * @returns 提取出的爱蜜莉雅对白列表
 */
export function extractDialogues(rawText: string): DialogueItem[] {
  if (!rawText || !rawText.trim()) {
    addLog('warn', 'EXTRACT', '提取台词跳过：输入文本为空')
    return []
  }

  const lines = rawText.split(/\r?\n/)
  const items: DialogueItem[] = []
  let globalIndex = 1

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // 匹配以“{爱蜜莉雅}”开头的段落
    if (trimmed.startsWith('{爱蜜莉雅}')) {
      let content = trimmed.substring('{爱蜜莉雅}'.length).trim()

      if (content.startsWith(':') || content.startsWith('：')) {
        content = content.substring(1).trim()
      }

      // 剥去台词外层的引号或括号
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
  }

  // 兜底：如果完全没有匹配到 {爱蜜莉雅}，但在酒馆对话中传入了单句纯文本
  if (items.length === 0 && rawText.trim().length > 0) {
    // 检查是否有任何其他 {xxx} 标签
    const generalMatch = rawText.trim().match(/^\{([^}]+)\}\s*[:：]?\s*(.*)$/s)
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
        speaker: generalMatch[1],
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
 */
export function extractXmlTagContent(text: string, tag = 'tts'): string {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = `<${safe}(?:\\s[^>]*)?>([\\s\\S]*?)</${safe}>`
  const matches = [...text.matchAll(new RegExp(expression, 'gi'))]
  return matches.map(match => match[1]).join('\n').replace(/<[^>]+>/g, '').trim()
}
