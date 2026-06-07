import { contextBridge, ipcRenderer } from 'electron'
import type { WidgetData } from './data'
import type { WidgetSettings } from './settings'
import type { ExchangeRateState } from './currency'

export interface InstallStatus {
  phase: 'installing' | 'launching' | 'done' | 'failed'
  error?: string
}

export interface WidgetAPI {
  getData: () => Promise<WidgetData>
  openDashboard: () => Promise<void>
  hideWindow: () => void
  resizeWindow: (height: number) => void
  onDataUpdate: (callback: (data: WidgetData) => void) => void
  onInstallStatus: (callback: (status: InstallStatus) => void) => void
  getSettings: () => Promise<WidgetSettings>
  saveSettings: (settings: WidgetSettings) => Promise<WidgetSettings>
  getExchangeRate: () => Promise<ExchangeRateState>
}

contextBridge.exposeInMainWorld('widget', {
  getData: () => ipcRenderer.invoke('widget:get-data'),
  openDashboard: () => ipcRenderer.invoke('widget:open-dashboard'),
  hideWindow: () => ipcRenderer.send('widget:hide-window'),
  resizeWindow: (height: number) => ipcRenderer.send('widget:resize-window', height),
  onDataUpdate: (callback: (data: WidgetData) => void) => {
    ipcRenderer.removeAllListeners('widget:data-update')
    ipcRenderer.on('widget:data-update', (_event, data) => callback(data))
  },
  onInstallStatus: (callback: (status: InstallStatus) => void) => {
    ipcRenderer.removeAllListeners('install:status')
    ipcRenderer.on('install:status', (_event, status) => callback(status))
  },
  getSettings: () => ipcRenderer.invoke('widget:get-settings'),
  saveSettings: (settings: WidgetSettings) => ipcRenderer.invoke('widget:save-settings', settings),
  getExchangeRate: () => ipcRenderer.invoke('widget:get-exchange-rate'),
} satisfies WidgetAPI)
