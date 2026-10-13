export type AudioReference = { id: string; name: string; audio_path: string; prompt_text?: string; emotion: string; description: string; duration?: number }
export type Dialogue = { id: string; index: number; speaker: string; original_text: string; text: string; context?: string; matched_audio_id?: string; speed?: number; inferred_emotion?: string; reason?: string }
export type Settings = {
  ttsBaseUrl: string; llmApiUrl: string; llmApiKey: string; llmModel: string; xmlTag: string;
  auto: boolean; temperature: number; speed: number; references: AudioReference[]; customPrompt: string;
}
export type Task = { id: string; messageId: number; createdAt: string; status: string; source: string; items: Array<{text:string; ja:string; audio?:string; error?:string}>; error?: string }

import mappingRaw from './mapping.json?raw';
import { createScriptIdDiv } from '@util/script';

const DEFAULTS: Settings = {
  ttsBaseUrl: 'http://127.0.0.1:9880', llmApiUrl: 'http://127.0.0.1:1234/v1', llmApiKey: '', llmModel: 'local-model',
  xmlTag: 'tts', auto: true, temperature: 0.3, speed: 0.9, references: [], customPrompt: ''
};
const VAR = { type: 'script' as const };
let settings: Settings = loadSettings();
let tasks: Task[] = loadTasks();
let panel: JQuery<HTMLElement> | null = null;
let running = false;

function loadSettings(): Settings {
  try { const saved = getVariables(VAR).emilia_tts_settings; const parsed = JSON.parse(mappingRaw); return { ...DEFAULTS, references: parsed, ...(saved || {}) }; } catch { return { ...DEFAULTS, references: [] }; }
}
function saveSettings() { replaceVariables({ ...getVariables(VAR), emilia_tts_settings: settings }, VAR); }
function loadTasks(): Task[] { try { return getVariables(VAR).emilia_tts_tasks || []; } catch { return []; } }
function saveTasks() { replaceVariables({ ...getVariables(VAR), emilia_tts_tasks: tasks.slice(-30) }, VAR); }
function log(...args: unknown[]) { console.info('[Emilia TTS]', ...args); }

function extractXml(text: string, tag = settings.xmlTag): string {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = `<${safe}(?:\\s[^>]*)?>([\\s\\S]*?)</${safe}>`;
  const matches = [...text.matchAll(new RegExp(expression, 'gi'))];
  return matches.map(match => match[1]).join('\n').replace(/<[^>]+>/g, '').trim();
}
function extractDialogues(raw: string): Dialogue[] {
  const out: Dialogue[] = []; const lines = raw.split(/\r?\n/); let n = 1;
  for (const line of lines) {
    const m = line.trim().match(/^\{([^}]+)\}\s*[:：]?\s*(.*)$/);
    if (!m || !m[2].trim()) continue;
    let text = m[2].trim();
    if ((text.startsWith('「') && text.endsWith('」')) || (text.startsWith('“') && text.endsWith('”')) || (text.startsWith('"') && text.endsWith('"')) || (text.startsWith('『') && text.endsWith('』'))) text = text.slice(1, -1).trim();
    out.push({ id: `d_${Date.now()}_${n}`, index: n++, speaker: m[1], original_text: text, text });
  }
  if (!out.length && raw.trim()) out.push({ id: `d_${Date.now()}_1`, index: 1, speaker: '爱蜜莉雅', original_text: raw.trim(), text: raw.trim() });
  return out;
}
function catalog(refs: AudioReference[]) { return refs.map(r => `- [${r.id}] ${r.name} | 情感:${r.emotion} | ${r.description} | prompt:${r.prompt_text || ''}`).join('\n'); }
async function matchWithLlm(dialogues: Dialogue[], fullText: string): Promise<any[]> {
  if (!settings.llmApiUrl || !settings.llmModel) throw Error('请配置 LLM API 地址和模型');
  if (!settings.references.length) throw Error('参考音频映射为空');
  const allowed = settings.references.map(r => r.id);
  const body = { model: settings.llmModel, temperature: settings.temperature, response_format: { type: 'json_object' }, messages: [
    { role: 'system', content: `你是日中双语配音导演。将输入对白翻译为自然日语，并从候选参考音频中选择最合适者。只返回 JSON: {"matches":[{"index":1,"ja_text":"...","matched_audio_id":"${allowed[0]}","speed":0.9,"inferred_emotion":"平静","reason":"..."}]}。ja_text 不超过50字符；matched_audio_id 必须是候选 ID。候选:\n${catalog(settings.references)}\n${settings.customPrompt}` },
    { role: 'user', content: `全文上下文:\n${fullText}\n待处理对白:\n${JSON.stringify(dialogues.map(d => ({ index:d.index, original_chinese:d.original_text, context_snippet:d.context || d.original_text })))} ` }
  ]};
  const headers: Record<string,string> = { 'Content-Type': 'application/json' }; if (settings.llmApiKey) headers.Authorization = `Bearer ${settings.llmApiKey}`;
  const res = await fetch(`${settings.llmApiUrl.replace(/\/+$/, '')}/chat/completions`, { method:'POST', headers, body:JSON.stringify(body) });
  if (!res.ok) throw Error(`LLM HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json(); let content = data?.choices?.[0]?.message?.content || ''; content = content.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  const parsed = JSON.parse(content); return Array.isArray(parsed) ? parsed : parsed.matches || [];
}
async function synthesize(items: Dialogue[]): Promise<{ filenames: string[]; items: Dialogue[] }> {
  const refs = new Map(settings.references.map(r => [r.id, r]));
  const valid = items.filter(i => i.text && i.matched_audio_id && refs.has(i.matched_audio_id));
  if (!valid.length) throw Error('没有可合成的对白');
  const speeds = valid.map(i => i.speed || settings.speed);
  const body = { texts: valid.map(i=>i.text), speaker_audio: valid.map(i=>refs.get(i.matched_audio_id!)!.audio_path), prompt_audio: valid.map(i=>refs.get(i.matched_audio_id!)!.audio_path), prompt_text: valid.map(i=>refs.get(i.matched_audio_id!)!.prompt_text || ''), is_cut_text:true, cut_minlen:10, cut_mute:0.2, return_subtitles:false, top_k:5, top_p:1, temperature:1, repetition_penalty:1.35, noise_scale:0.667, speed:speeds.every(s=>s===speeds[0])?speeds[0]:speeds };
  const res = await fetch(`${settings.ttsBaseUrl.replace(/\/+$/, '')}/tts/batched`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!res.ok) throw Error(`TTS HTTP ${res.status}: ${await res.text()}`); return { ...(await res.json()), items: valid };
}
function audioUrl(filename: string) { return `${settings.ttsBaseUrl.replace(/\/+$/, '')}/audio/${encodeURIComponent(filename)}`; }
function insertAudioButton(messageId: number, source: string, url: string, key: string) {
  const $message = retrieveDisplayedMessage(messageId); if (!$message.length) return;
  if ($message.find(`[data-emilia-tts="${key}"]`).length) return;
  const root = $message[0]; const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node: Node | null;
  while ((node = walker.nextNode())) { if ((node.nodeValue || '').includes(source)) { const el = document.createElement('button'); el.dataset.emiliaTts = key; el.type='button'; el.textContent='🔊 播放'; el.title='播放 Emilia TTS'; el.style.cssText='margin-left:.4em;cursor:pointer;border:1px solid var(-- SmartThemeBorderColor,#888);border-radius:4px;background:transparent;color:inherit;'; el.onclick=()=>{ const a=new Audio(url); void a.play(); }; (node.parentNode as Node).insertBefore(el, node.nextSibling); return; } }
  $message.append(`<button type="button" data-emilia-tts="${key}">🔊 播放</button>`).find(`[data-emilia-tts="${key}"]`).last().on('click',()=>{ const a=new Audio(url); void a.play(); });
}
async function processMessage(messageId: number) {
  if (running || !settings.auto) return; const msg = getChatMessages(messageId)[0]; if (!msg) return; const extracted = extractXml(msg.message); if (!extracted) return;
  running = true; const task: Task = { id: crypto.randomUUID(), messageId, createdAt:new Date().toISOString(), status:'running', source:extracted, items:[] }; tasks.push(task); saveTasks(); renderPanel();
  try { const dialogues = extractDialogues(extracted); const matches = await matchWithLlm(dialogues, extracted); matches.forEach((m:any)=>{ const d=dialogues.find(x=>x.index===Number(m.index)); if(d){ d.text=String(m.ja_text||d.text); d.matched_audio_id=String(m.matched_audio_id||''); d.speed=Number(m.speed)||settings.speed; d.inferred_emotion=String(m.inferred_emotion||''); d.reason=String(m.reason||''); }}); const result=await synthesize(dialogues); result.filenames.forEach((file,i)=>{ const d=result.items[i]; if (!d) return; const url=audioUrl(file); task.items.push({text:d.original_text,ja:d.text,audio:url}); insertAudioButton(messageId,d.original_text,url,`${task.id}_${i}`); }); task.status='done';
  } catch (e:any) { task.status='failed'; task.error=e?.message || String(e); log('error', task.error); } finally { running=false; saveTasks(); renderPanel(); }
}
function renderPanel() {
  if (!panel) return; const html = `<div style="padding:12px;background:var(--SmartThemeBlurTintColor,#222);color:var(--SmartThemeBodyColor,#eee);font:13px sans-serif;max-height:70vh;overflow:auto"><div style="display:flex;justify-content:space-between;align-items:center"><b>Emilia TTS 任务</b><button data-close>关闭</button></div><div style="margin:.5em 0"><label>XML标签 <input data-setting="xmlTag" value="${escapeHtml(settings.xmlTag)}"></label> <label>TTS <input data-setting="ttsBaseUrl" value="${escapeHtml(settings.ttsBaseUrl)}" size="24"></label><label>LLM <input data-setting="llmApiUrl" value="${escapeHtml(settings.llmApiUrl)}" size="24"></label> <label>模型 <input data-setting="llmModel" value="${escapeHtml(settings.llmModel)}" size="16"></label> <label>Key <input type="password" data-setting="llmApiKey" value="${escapeHtml(settings.llmApiKey)}" size="12"></label></div>${tasks.slice().reverse().map(t=>`<details ${t.status==='running'?'open':''}><summary>${t.createdAt} · 楼层${t.messageId} · ${t.status}</summary><div>${t.error?`<p style="color:#f88">${escapeHtml(t.error)}</p>`:t.items.map(x=>`<p>${escapeHtml(x.text)} → ${escapeHtml(x.ja)} ${x.audio?`<audio controls src="${x.audio}" style="max-width:240px"></audio>`:''}</p>`).join('')}</div></details>`).join('')}</div>`;
  panel.html(html); panel.find('[data-close]').on('click', closeTaskViewer); panel.find('[data-setting]').on('change', function(){ const k=$(this).data('setting') as keyof Settings; (settings as any)[k]=$(this).val(); saveSettings(); });
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string)); }
export function openTaskViewer() { if (!panel) panel=createScriptIdDiv().css({position:'fixed',right:'20px',top:'70px',width:'min(760px,calc(100vw - 40px))',zIndex:99999,background:'#222',border:'1px solid #777',boxShadow:'0 8px 30px #0008'}).appendTo('body'); renderPanel(); }
export function closeTaskViewer() { panel?.remove(); panel=null; }

$(() => { appendInexistentScriptButtons([{ name:'打开 Emilia TTS 任务', visible:true }]); eventOn(getButtonEvent('打开 Emilia TTS 任务'), openTaskViewer); eventOn(tavern_events.MESSAGE_RECEIVED, (id:number) => void processMessage(id)); (globalThis as any).EmiliaTTS = { openTaskViewer, closeTaskViewer, processMessage, get settings(){return settings}, saveSettings }; log('loaded'); });





