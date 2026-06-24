import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { isSupportedStoryFile, readStoryFileText } from '@/lib/home/read-story-file'

describe('readStoryFileText', () => {
  it('reads plain text story files', async () => {
    const file = new File(['第一章\n从这里开始。'], 'story.text', { type: 'text/plain' })

    await expect(readStoryFileText(file)).resolves.toBe('第一章\n从这里开始。')
  })

  it('extracts paragraph text from docx files', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:body>',
      '<w:p><w:r><w:t>第一章</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>从这里</w:t></w:r><w:r><w:t>开始。</w:t></w:r></w:p>',
      '</w:body>',
      '</w:document>',
    ].join(''))
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], 'story.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    await expect(readStoryFileText(file)).resolves.toBe('第一章\n从这里开始。')
  })
})

describe('isSupportedStoryFile', () => {
  it('accepts text, markdown, and docx file names', () => {
    expect(isSupportedStoryFile(new File([''], 'story.txt'))).toBe(true)
    expect(isSupportedStoryFile(new File([''], 'story.md'))).toBe(true)
    expect(isSupportedStoryFile(new File([''], 'story.text'))).toBe(true)
    expect(isSupportedStoryFile(new File([''], 'story.docx'))).toBe(true)
  })

  it('rejects unsupported file names', () => {
    expect(isSupportedStoryFile(new File([''], 'story.pdf'))).toBe(false)
  })
})
