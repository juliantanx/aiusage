import { contextBridge, ipcRenderer } from 'electron'
import type { WidgetData } from './data'

export interface WidgetAPI {
  getData: () => Promise<WidgetData>
  openDashboard: () => Promise<void>
  hideWindow: () => void
  onDataUpdate: (callback: (data: WidgetData) => void) => void
}

contextBridge.exposeInMainWorld('widget', {
  getData: () => ipcRenderer.invoke('widget:get-data'),
  openDashboard: () => ipcRenderer.invoke('widget:open-dashboard'),
  hideWindow: () => ipcRenderer.send('widget:hide-window'),
  onDataUpdate: (callback: (data: WidgetData) => void) => {
    ipcRenderer.removeAllListeners('widget:data-update')
    ipcRenderer.on('widget:data-update', (_event, data) => callback(data))
  },
} satisfies WidgetAPI)
