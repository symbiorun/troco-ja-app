'use client'

import { useState, useEffect, useCallback } from 'react'

export interface SimulationData {
  pixAmount: number
  cardTotal: number
  feePct: number
  profitMarginPct: number
  installments: number
  channel: string
}

export interface CustomerData {
  name: string
  cpf: string
  email: string
  phone: string
}

export interface PixData {
  pixKey: string
  pixKeyType: string
}

interface ApplicationSession {
  applicationId: string | null
  simulation: SimulationData | null
  customer: CustomerData | null
  pixData: PixData | null
  isLoading: boolean
  setApplicationId: (id: string) => void
  setSimulation: (data: SimulationData) => void
  setCustomer: (data: CustomerData) => void
  setPixData: (data: PixData) => void
  clearSession: () => void
}

function readSession<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeSession(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage quota exceeded or unavailable — ignore
  }
}

function removeSession(key: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function useApplicationSession(): ApplicationSession {
  const [isLoading, setIsLoading] = useState(true)
  const [applicationId, setApplicationIdState] = useState<string | null>(null)
  const [simulation, setSimulationState] = useState<SimulationData | null>(null)
  const [customer, setCustomerState] = useState<CustomerData | null>(null)
  const [pixData, setPixDataState] = useState<PixData | null>(null)

  // Restore session on mount
  useEffect(() => {
    const storedId    = sessionStorage.getItem('applicationId')
    const storedSim   = readSession<SimulationData>('simulation')
    const storedCust  = readSession<CustomerData>('customer')
    const storedPix   = readSession<PixData>('pixData')

    if (storedId) {
      setApplicationIdState(storedId)
      setSimulationState(storedSim)
      setCustomerState(storedCust)
      setPixDataState(storedPix)
      setIsLoading(false)
      return
    }

    // sessionStorage empty — try localStorage for applicationId only
    const persistedId = typeof window !== 'undefined'
      ? localStorage.getItem('applicationId')
      : null

    if (!persistedId) {
      setIsLoading(false)
      return
    }

    // Repopulate sessionStorage from API
    async function restore() {
      try {
        const res = await fetch(`/api/aplicacao/${persistedId}`)
        if (res.ok) {
          const data = await res.json() as {
            applicationId?: string
            simulation?: SimulationData
            customer?: CustomerData
            pixData?: PixData
          }
          const id = data.applicationId ?? (persistedId as string)
          sessionStorage.setItem('applicationId', id)
          if (data.simulation) writeSession('simulation', data.simulation)
          if (data.customer) writeSession('customer', data.customer)
          if (data.pixData) writeSession('pixData', data.pixData)
          setApplicationIdState(id)
          setSimulationState(data.simulation ?? null)
          setCustomerState(data.customer ?? null)
          setPixDataState(data.pixData ?? null)
        }
      } catch {
        // ignore — session simply stays empty
      } finally {
        setIsLoading(false)
      }
    }

    restore()
  }, [])

  const setApplicationId = useCallback((id: string) => {
    sessionStorage.setItem('applicationId', id)
    if (typeof window !== 'undefined') localStorage.setItem('applicationId', id)
    setApplicationIdState(id)
  }, [])

  const setSimulation = useCallback((data: SimulationData) => {
    writeSession('simulation', data)
    setSimulationState(data)
  }, [])

  const setCustomer = useCallback((data: CustomerData) => {
    writeSession('customer', data)
    setCustomerState(data)
  }, [])

  const setPixData = useCallback((data: PixData) => {
    writeSession('pixData', data)
    setPixDataState(data)
  }, [])

  const clearSession = useCallback(() => {
    removeSession('applicationId')
    removeSession('simulation')
    removeSession('customer')
    removeSession('pixData')
    if (typeof window !== 'undefined') localStorage.removeItem('applicationId')
    setApplicationIdState(null)
    setSimulationState(null)
    setCustomerState(null)
    setPixDataState(null)
  }, [])

  return {
    applicationId,
    simulation,
    customer,
    pixData,
    isLoading,
    setApplicationId,
    setSimulation,
    setCustomer,
    setPixData,
    clearSession,
  }
}
