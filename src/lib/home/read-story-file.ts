import JSZip from 'jszip'

const TEXT_EXTENSIONS = ['.txt', '.md', '.text']

function getLowerFileName(file: File): string {
  return file.name.trim().toLowerCase()
}

export function isSupportedStoryFile(file: File): boolean {
  const fileName = getLowerFileName(file)
  return TEXT_EXTENSIONS.some((extension) => fileName.endsWith(extension)) || fileName.endsWith('.docx')
}

function decodeXmlText(value: string): string {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    return parser.parseFromString(`<root>${value}</root>`, 'text/xml').documentElement.textContent ?? ''
  }

  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

async function readDocxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const documentXml = await zip.file('word/document.xml')?.async('text')
  if (!documentXml) return ''

  const paragraphMatches = documentXml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? []
  const paragraphs = paragraphMatches.map((paragraph) => {
    const textNodes = paragraph.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? []
    return textNodes.map((node) => {
      const text = node.replace(/^<w:t(?:\s[^>]*)?>/, '').replace(/<\/w:t>$/, '')
      return decodeXmlText(text)
    }).join('')
  })

  return paragraphs.filter((paragraph) => paragraph.trim()).join('\n')
}

export async function readStoryFileText(file: File): Promise<string> {
  if (!isSupportedStoryFile(file)) {
    throw new Error('Unsupported file type')
  }

  if (getLowerFileName(file).endsWith('.docx')) {
    return readDocxText(file)
  }

  return file.text()
}
