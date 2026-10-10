/**
 * 드래그앤드롭/폴더 선택으로 받은 항목을 업로드 단위로 정리.
 *
 * 폴더는 relPath("루트/하위/파일.ext") 를 가진 FolderItem 목록으로 펼치고,
 * 최상위 폴더마다 한 묶음(목록에서 한 행)으로 나눈다. 낱개 파일은 각자 한 행.
 */

export interface FolderItem {
  file: File
  /** "루트폴더/하위/파일.ext" */
  relPath: string
}

export interface DropBatch {
  files: File[]
  /** 최상위 폴더 이름 → 그 아래 파일들 */
  folders: { name: string; items: FolderItem[] }[]
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // readEntries 는 한 번에 최대 100개만 반환: 빈 배열 나올 때까지 반복.
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const pump = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all)
        all.push(...batch)
        pump()
      }, reject)
    }
    pump()
  })
}

async function collectEntry(entry: FileSystemEntry, prefix: string, out: FolderItem[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    out.push({ file, relPath: prefix + file.name })
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const children = await readAllEntries(reader)
    for (const child of children) await collectEntry(child, prefix + entry.name + "/", out)
  }
}

/** relPath 목록을 최상위 폴더별로 묶는다. 경로에 "/" 가 없으면 낱개 파일 */
export function groupByRoot(items: FolderItem[]): DropBatch {
  const files: File[] = []
  const map = new Map<string, FolderItem[]>()
  for (const it of items) {
    const slash = it.relPath.indexOf("/")
    if (slash < 0) {
      files.push(it.file)
      continue
    }
    const root = it.relPath.slice(0, slash)
    const list = map.get(root) ?? []
    list.push(it)
    map.set(root, list)
  }
  return { files, folders: [...map].map(([name, list]) => ({ name, items: list })) }
}

/** DataTransfer → 업로드 묶음. 엔트리 API 가 없으면 낱개 파일만 */
export async function readDataTransfer(dt: DataTransfer): Promise<DropBatch> {
  const entries: FileSystemEntry[] = []
  const items = dt.items
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (entry) entries.push(entry)
    }
  }
  if (entries.length === 0) return { files: Array.from(dt.files), folders: [] }
  const collected: FolderItem[] = []
  for (const e of entries) await collectEntry(e, "", collected)
  return groupByRoot(collected)
}

/** <input webkitdirectory> 의 FileList → 업로드 묶음 */
export function readFolderInput(list: FileList | File[]): DropBatch {
  const files = Array.isArray(list) ? list : Array.from(list)
  return groupByRoot(
    files.map((f) => ({
      file: f,
      relPath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    })),
  )
}
