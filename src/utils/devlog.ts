const isDev = import.meta.env.DEV

export function devlog(...args: any[]): void {
  if (isDev) {
    console.log('[DEV]', ...args)
  }
}

export function devwarn(...args: any[]): void {
  if (isDev) {
    console.warn('[DEV]', ...args)
  }
}

export function deverror(...args: any[]): void {
  if (isDev) {
    console.error('[DEV]', ...args)
  }
}

export function devtable(data: any): void {
  if (isDev) {
    console.table(data)
  }
}

export function devtime(label: string): void {
  if (isDev) {
    console.time(label)
  }
}

export function devtimeEnd(label: string): void {
  if (isDev) {
    console.timeEnd(label)
  }
}
